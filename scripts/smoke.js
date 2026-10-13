// End-to-end smoke test: simulates players over real sockets against a running server.
// Usage: npm start (in another terminal), then: npm test
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function player(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const p = { s, name, state: null, chat: [], ops: [] };
  s.on('state', (st) => (p.state = st));
  s.on('chat', (m) => p.chat.push(m));
  s.on('draw:op', (op) => p.ops.push(op));
  p.emit = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  p.until = async (fn, what, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (p.state && fn(p.state)) return p.state;
      await sleep(25);
    }
    throw new Error(`${name}: timed out waiting for ${what}`);
  };
  return p;
}

async function soloGame() {
  const a = player('Alice');
  const b = player('Bob');
  const c = player('Cara');
  const created = await a.emit('room:create', { name: 'Alice', avatar: '🦊' });
  assert.ok(created.ok, 'room created');
  const code = created.code;
  assert.ok((await b.emit('room:join', { code, name: 'Bob' })).ok);
  assert.ok((await c.emit('room:join', { code, name: 'Cara' })).ok);
  assert.equal((await b.emit('room:join', { code: 'ZZZZZ', name: 'x' })).error?.includes("doesn't exist"), true);

  a.s.emit('settings:update', { rounds: 1, drawTime: 30, hints: 2 });
  await a.until((s) => s.settings.rounds === 1 && s.players.length === 3, 'settings + 3 players');
  a.s.emit('game:start');

  const st = await a.until((s) => s.phase === 'choosing', 'choosing');
  const all = [a, b, c];
  const drawer = all.find((p) => p.state.me === st.turn.drawerId);
  const [g1, g2] = all.filter((p) => p !== drawer);
  await drawer.until((s) => s.turn?.choices?.length === 3, 'word choices');
  assert.equal(g1.state.turn.choices, null, 'guessers never see choices');
  drawer.s.emit('word:choose', 0);
  const ds = await drawer.until((s) => s.phase === 'drawing', 'drawing');
  const word = ds.turn.word;
  await g1.until((s) => s.phase === 'drawing', 'g1 drawing');
  assert.equal(g1.state.turn.word, null, 'guessers do not get the word');
  assert.equal(g1.state.turn.mask.length, Array.from(word).length, 'mask length');

  // Drawing is relayed to others.
  drawer.s.emit('draw:op', { type: 'stroke', id: 'abc', color: '#ff0000', size: 12, points: [10, 10] });
  await sleep(150);
  assert.equal(g1.ops.length, 1, 'stroke relayed');
  // Non-drawers can't draw.
  g1.s.emit('draw:op', { type: 'stroke', id: 'zzz', color: '#ff0000', size: 12, points: [10, 10] });
  await sleep(150);
  assert.equal(drawer.ops.length, 0, 'guesser stroke rejected');

  // Wrong guess goes public, close guess gets a hint, right guess is hidden.
  g1.s.emit('chat', 'definitely not it');
  g1.s.emit('chat', word.toUpperCase() + '!!');
  await g1.until((s) => s.players.find((p) => p.id === s.me).guessed, 'g1 guessed');
  assert.ok(g1.state.turn.word === word, 'guesser now sees the word');
  assert.ok(!g2.chat.some((m) => m.text?.toLowerCase().includes(word.toLowerCase()) && m.type === 'chat'), 'word not leaked');
  const g1Score = g1.state.players.find((p) => p.id === g1.state.me).score;
  assert.ok(g1Score > 0, 'g1 scored');

  // Guessed player chat is private to knowers.
  g1.s.emit('chat', 'secret hello');
  await sleep(150);
  assert.ok(drawer.chat.some((m) => m.text === 'secret hello' && m.channel === 'guessed'), 'drawer sees secret chat');
  assert.ok(!g2.chat.some((m) => m.text === 'secret hello'), 'g2 does not see secret chat');

  g2.s.emit('chat', word);
  await a.until((s) => s.phase === 'turnEnd', 'turn ends when all guessed');
  assert.equal(a.state.turn.reveal.reason, 'all_guessed');
  const drawerScore = a.state.players.find((p) => p.id === drawer.state.me).score;
  assert.ok(drawerScore > 0, 'drawer scored');
  console.log(`✓ solo: guessing, privacy, scoring (word "${word}", g1 +${g1Score}, drawer +${drawerScore})`);

  // Skip remaining turns quickly via host skip, game should end after round 1.
  for (let i = 0; i < 3; i++) {
    await a.until((s) => s.phase === 'choosing' || s.phase === 'gameOver', 'next turn', 9000);
    if (a.state.phase === 'gameOver') break;
    a.s.emit('turn:skip');
    await a.until((s) => s.phase !== 'choosing', 'skipped');
  }
  await a.until((s) => s.phase === 'gameOver', 'game over', 12000);
  console.log('✓ solo: rounds advance and game ends');

  // Reconnect with token keeps the seat.
  const token = created.token;
  a.s.disconnect();
  await b.until((s) => !s.players.find((p) => p.name === 'Alice').connected, 'alice away');
  assert.equal(b.state.hostId !== created.id, true, 'host migrated');
  const a2 = player('Alice');
  const re = await a2.emit('room:join', { code, token });
  assert.equal(re.id, created.id, 'same seat after reconnect');
  console.log('✓ reconnect keeps seat, host migrates');
  for (const p of [a2, b, c]) p.s.disconnect();
}

async function hintTest() {
  const a = player('Hana');
  const b = player('Ivo');
  const { code } = await a.emit('room:create', { name: 'Hana' });
  await b.emit('room:join', { code, name: 'Ivo' });
  a.s.emit('settings:update', { drawTime: 30, hints: 2, customWords: 'elephant, giraffe', customOnly: true, wordChoices: 1 });
  await a.until((s) => s.settings.customOnly && s.players.length === 2, 'settings');
  a.s.emit('game:start');
  await a.until((s) => s.phase === 'choosing', 'choosing');
  const drawer = a.state.turn.drawerId === a.state.me ? a : b;
  const guesser = drawer === a ? b : a;
  drawer.s.emit('word:choose', 0);
  await guesser.until((s) => s.phase === 'drawing', 'drawing');
  assert.equal(guesser.state.turn.hintsTotal, 2);
  assert.ok(guesser.state.turn.mask.every((c) => c === null), 'no letters at start');
  // 2 hints over 30s → first at 10s.
  await guesser.until((s) => s.turn.hintsGiven === 1, 'first hint', 12000);
  assert.equal(guesser.state.turn.mask.filter((c) => c !== null).length, 1, 'one letter revealed');
  console.log(`✓ hints: letter revealed as time runs down → ${guesser.state.turn.mask.map((c) => c ?? '_').join('')}`);
  a.s.disconnect();
  b.s.disconnect();
}

async function teamGame() {
  const ps = ['Mom', 'Dad', 'Kid', 'Gran'].map(player);
  const { code } = await ps[0].emit('room:create', { name: 'Mom' });
  for (const p of ps.slice(1)) await p.emit('room:join', { code, name: p.name });
  const host = ps[0];
  host.s.emit('settings:update', { mode: 'teams', teamCount: 2, allowSteals: false, rounds: 1, drawTime: 60 });
  await host.until((s) => s.settings.mode === 'teams' && s.players.length === 4, 'teams settings');
  const teamsOf = host.state.players.map((p) => p.team);
  assert.deepEqual([...teamsOf].sort(), [0, 0, 1, 1], 'auto-balanced teams');
  host.s.emit('game:start');
  await host.until((s) => s.phase === 'choosing', 'choosing');
  const drawer = ps.find((p) => p.state.me === host.state.turn.drawerId);
  const team = host.state.turn.team;
  drawer.s.emit('word:choose', 0);
  await drawer.until((s) => s.phase === 'drawing', 'drawing');
  const word = drawer.state.turn.word;
  const mate = ps.find((p) => p !== drawer && p.state.players.find((x) => x.id === p.state.me).team === team);
  const rival = ps.find((p) => p.state.players.find((x) => x.id === p.state.me).team !== team);
  assert.equal(rival.state.turn.canGuess, false, 'rival cannot guess with steals off');
  rival.s.emit('chat', word);
  await sleep(200);
  assert.equal(host.state.phase, 'drawing', 'rival correct guess ignored');
  assert.ok(rival.chat.some((m) => m.type === 'private'), 'rival told to keep quiet');
  mate.s.emit('chat', word);
  await host.until((s) => s.phase === 'turnEnd', 'turn ends on teammate guess');
  assert.equal(host.state.turn.reveal.reason, 'guessed');
  assert.ok(host.state.teamScores[team] > 0, 'team scored');
  console.log(`✓ teams: only own team scores, steals blocked, team score ${host.state.teamScores[team]}`);
  for (const p of ps) p.s.disconnect();
}

try {
  await soloGame();
  await hintTest();
  await teamGame();
  console.log('\nAll smoke tests passed 🎉');
  process.exit(0);
} catch (err) {
  console.error('✗', err);
  process.exit(1);
}
