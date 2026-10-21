// End-to-end smoke test: simulates players over real sockets against a running server.
// Usage: npm start (in another terminal), then: npm test
// Against a deployed site: URL=https://your-site.onrender.com npm test
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { canPlayCard } from '../shared/constants.js';

const URL = process.env.URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A remote server needs longer than localhost before "this did NOT happen" checks are fair.
const REMOTE = !/localhost|127\.0\.0\.1/.test(URL);
const SETTLE = REMOTE ? 1500 : 150;

async function waitFor(fn, what, ms = REMOTE ? 15000 : 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function player(name, token) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, auth: { token } });
  const p = { s, name, state: null, chat: [], ops: [], rewards: [], splats: 0 };
  s.on('state', (st) => (p.state = st));
  s.on('chat', (m) => p.chat.push(m));
  s.on('draw:op', (op) => p.ops.push(op));
  s.on('rewards', (r) => p.rewards.push(r));
  s.on('splat', () => p.splats++);
  p.emit = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  p.until = async (fn, what, ms = REMOTE ? 15000 : 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (p.state && fn(p.state)) return p.state;
      await sleep(25);
    }
    throw new Error(`${name}: timed out waiting for ${what}`);
  };
  return p;
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${URL}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json()) };
}

/** Play one short game: every drawer picks the first word and the other player guesses it. */
async function playQuickGame(host, players) {
  host.s.emit('game:start');
  await host.until((s) => s.phase === 'choosing', 'game start');
  for (let turn = 0; turn < 10; turn++) {
    await host.until((s) => s.phase === 'choosing' || s.phase === 'gameOver', 'next turn', 10000);
    if (host.state.phase === 'gameOver') return;
    const drawer = players.find((p) => p.state.me === host.state.turn.drawerId);
    await drawer.until((s) => s.turn?.choices, 'choices');
    drawer.s.emit('word:choose', 0);
    await drawer.until((s) => s.phase === 'drawing', 'drawing');
    for (const p of players) if (p !== drawer) p.s.emit('chat', drawer.state.turn.word);
    await host.until((s) => s.phase === 'turnEnd', 'turn end');
  }
  await host.until((s) => s.phase === 'gameOver', 'game over', 10000);
}

async function powerUpTest() {
  // Accounts, the star economy and power-up cards, end to end.
  const tag = Math.random().toString(36).slice(2, 7);
  const regA = await api('/register', { method: 'POST', body: { username: `test_a_${tag}`, password: 'secret123' } });
  const regB = await api('/register', { method: 'POST', body: { username: `test_b_${tag}`, password: 'secret123' } });
  assert.ok(regA.token && regB.token, 'registered two accounts');
  try {
    assert.equal((await api('/shop/buy', { method: 'POST', body: { card: 'category' }, token: regA.token })).status, 400, 'no stars yet');

    const a = player('A', regA.token);
    const b = player('B', regB.token);
    const { code } = await a.emit('room:create', { name: 'A' });
    await b.emit('room:join', { code, name: 'B' });
    a.s.emit('settings:update', { rounds: 1, difficulty: 'easy', hints: 0, drawTime: 60 });
    await a.until((s) => s.players.length === 2 && s.settings.rounds === 1, 'settings');
    assert.deepEqual(a.state.cards, {}, 'signed-in player has a card inventory');
    assert.equal(a.state.players.find((p) => p.id === a.state.me).level, 1, 'level badge');

    // Earn stars by finishing games.
    await playQuickGame(a, [a, b]);
    await a.until(() => a.rewards.length === 1, 'rewards after game 1');
    const first = a.rewards[0];
    assert.ok(first.parts.daily === 5 && first.stars >= 10, `first game pays points + daily bonus (got ${first.stars})`);
    for (let g = 0; g < 3 && (await api('/me', { token: regA.token })).user.stars < 20; g++) await playQuickGame(a, [a, b]);
    const me = await api('/me', { token: regA.token });
    assert.ok(me.user.stars >= 20 && me.user.gamesPlayed >= 2 && me.history.length >= 2, 'stars, stats and history saved');

    // Buy a card and play it.
    const bought = await api('/shop/buy', { method: 'POST', body: { card: 'category' }, token: regA.token });
    assert.equal(bought.inventory.category, 1, 'card bought');
    assert.equal(bought.stars, me.user.stars - 20, 'stars spent');
    a.s.emit('power:refresh');
    await a.until((s) => s.cards?.category === 1, 'card shows in game');

    a.s.emit('game:start');
    await a.until((s) => s.phase === 'choosing', 'game start');
    if (a.state.turn.drawerId === a.state.me) {
      // A draws first: skip so B draws and A can guess.
      a.s.emit('turn:skip');
      await a.until((s) => s.phase === 'choosing' && s.turn.drawerId !== s.me, 'B draws', 10000);
    }
    await b.until((s) => s.turn?.choices, 'B choices');
    b.s.emit('word:choose', 0);
    await a.until((s) => s.phase === 'drawing', 'drawing');
    assert.equal(a.state.turn.category, null, 'category hidden before the card');
    a.s.emit('power:use', 'category');
    await a.until((s) => s.turn.category && !(s.cards.category > 0), 'category revealed and card used');
    a.s.emit('power:use', 'category');
    await waitFor(() => a.chat.some((m) => m.type === 'private' && m.text.includes('One card per turn')), 'one card per turn');
    await waitFor(() => b.chat.some((m) => m.type === 'power'), 'everyone sees the card being played');

    assert.equal((await api('/me', { token: regA.token })).inventory.category, undefined, 'inventory updated in DB');
    console.log(`✓ power-ups: stars earned (${first.stars} first game), card bought & played, limits enforced`);
    for (const p of [a, b]) p.s.disconnect();
  } finally {
    await api('/me', { method: 'DELETE', token: regA.token });
    await api('/me', { method: 'DELETE', token: regB.token });
  }
}

async function imposterTest() {
  const ps = ['Ivy', 'Jon', 'Kim', 'Lou'].map((n) => player(n));
  const { code } = await ps[0].emit('room:create', { name: 'Ivy' });
  for (const p of ps.slice(1)) await p.emit('room:join', { code, name: p.name });
  const host = ps[0];
  host.s.emit('settings:update', { game: 'imposter', rounds: 1, clueRounds: 1, clueTime: 30, voteTime: 30 });
  await host.until((s) => s.settings.game === 'imposter' && s.players.length === 4, 'imposter settings');
  host.s.emit('game:start');
  for (const p of ps) await p.until((s) => s.phase === 'clues' && s.imp?.role, 'secret role');
  const imp = ps.find((p) => p.state.imp.role === 'imposter');
  const crew = ps.filter((p) => p !== imp);
  assert.equal(crew.length, 3, 'one imposter');
  assert.equal(imp.state.imp.word, null, 'imposter never sees the word');
  const word = crew[0].state.imp.word;
  assert.ok(crew.every((p) => p.state.imp.word === word), 'crew share the word');

  // Everyone gives a clue, in the order the game picks.
  while (host.state.phase === 'clues') {
    const current = host.state.imp.current;
    const giver = ps.find((p) => p.state.me === current);
    giver.s.emit('imp:clue', 'thing');
    await host.until((s) => s.phase !== 'clues' || s.imp.current !== current, 'next clue');
  }
  await host.until((s) => s.phase === 'vote', 'vote phase');
  for (const p of ps) p.s.emit('imp:vote', p === imp ? crew[0].state.me : imp.state.me);
  await host.until((s) => s.phase === 'guess', 'caught imposter gets a last guess');
  imp.s.emit('imp:guess', word);
  await host.until((s) => s.phase === 'impReveal', 'reveal');
  assert.equal(host.state.imp.reveal.outcome, 'imposterGuessed', 'right guess steals the win');
  assert.equal(host.state.players.find((p) => p.id === imp.state.me).score, 200);
  await host.until((s) => s.phase === 'gameOver', 'game over', 30000);
  console.log('✓ imposter: secret roles, clues, voting, last-chance guess steals the win');
  for (const p of ps) p.s.disconnect();
}

async function cardsTest() {
  const ps = ['Mo', 'Nia', 'Oz'].map((n) => player(n));
  const { code } = await ps[0].emit('room:create', { name: 'Mo' });
  for (const p of ps.slice(1)) await p.emit('room:join', { code, name: p.name });
  const host = ps[0];
  host.s.emit('settings:update', { game: 'cards', rounds: 1, turnTime: 30, handSize: 7 });
  await host.until((s) => s.settings.game === 'cards' && s.players.length === 3, 'card settings');
  host.s.emit('game:start');
  for (const p of ps) await p.until((s) => s.phase === 'cards' && s.clash?.hand?.length === 7, 'dealt 7 cards');
  const ids = new Set(ps.flatMap((p) => p.state.clash.hand.map((c) => c.id)));
  assert.equal(ids.size, 21, 'everyone has their own private hand');
  assert.ok(/^\d$/.test(host.state.clash.pile.at(-1).value), 'pile starts on a number card');
  assert.ok(host.state.clash.events.some((e) => e.type === 'deal'), 'deal is animated');

  // Ten moves: whoever's turn it is plays a matching card, or draws.
  for (let m = 0; m < 10 && host.state.phase === 'cards'; m++) {
    const cur = ps.find((p) => p.state.me === host.state.clash.current);
    const c = cur.state.clash;
    const card = c.hand.find((x) => (!c.drawn || x.id === c.drawn) && canPlayCard(x, c.pile.at(-1), c.color, c.pending, c.stacking));
    const last = host.state.clash.events.at(-1).id;
    if (card) cur.s.emit('cards:play', { id: card.id, color: 'red' });
    else if (c.drawn) cur.s.emit('cards:pass');
    else cur.s.emit('cards:draw');
    await host.until((s) => s.clash?.events.at(-1).id > last || s.clash?.current !== c.current, 'move registered');
    await sleep(50);
  }
  const counts = Object.values(host.state.clash.counts).reduce((a, b) => a + b, 0);
  assert.ok(counts >= 3, 'cards are tracked');
  const others = ps[1].state.clash.events.filter((e) => e.type === 'draw' && e.pid !== ps[1].state.me);
  assert.ok(others.every((e) => !e.cards), "you never see the cards other players draw");
  console.log('✓ color clash: private hands, deal, matching plays, draws and turns');
  for (const p of ps) p.s.disconnect();
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
  await waitFor(() => g1.ops.length === 1, 'stroke relayed');
  // Non-drawers can't draw.
  g1.s.emit('draw:op', { type: 'stroke', id: 'zzz', color: '#ff0000', size: 12, points: [10, 10] });
  await sleep(SETTLE);
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
  await waitFor(() => drawer.chat.some((m) => m.text === 'secret hello' && m.channel === 'guessed'), 'drawer sees secret chat');
  await sleep(SETTLE);
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

  // Reconnect with token keeps the seat; the host keeps the crown during a short blip.
  const token = created.token;
  a.s.disconnect();
  await b.until((s) => !s.players.find((p) => p.name === 'Alice').connected, 'alice away');
  assert.equal(b.state.hostId, created.id, 'host kept during grace period');
  const a2 = player('Alice');
  const re = await a2.emit('room:join', { code, token });
  assert.equal(re.id, created.id, 'same seat after reconnect');
  // A second device with the saved seat must ask before taking it over.
  const a3 = player('Alice');
  const conflict = await a3.emit('room:join', { code, token, takeover: false });
  assert.equal(conflict.error, 'seat_active', 'live seat is not stolen silently');
  let kicked = null;
  a2.s.on('kicked', (k) => (kicked = k));
  const moved = await a3.emit('room:join', { code, token, takeover: true });
  assert.equal(moved.id, created.id, 'seat moved to new device');
  await waitFor(() => kicked?.takeover === true, 'old tab told the seat moved');
  console.log('✓ reconnect keeps seat; host kept during blip; seat takeover asks first');
  for (const p of [a2, a3, b, c]) p.s.disconnect();
}

async function dropoutTest() {
  // 2-player game: one player drops mid-turn. The game must wait for them, keep their score,
  // and carry on when they come back.
  const a = player('Dina');
  const b = player('Eli');
  const created = await a.emit('room:create', { name: 'Dina' });
  const { code } = created;
  const joined = await b.emit('room:join', { code, name: 'Eli' });
  a.s.emit('settings:update', { drawTime: 60, rounds: 2 });
  await a.until((s) => s.players.length === 2 && s.settings.rounds === 2, 'settings');
  a.s.emit('game:start');
  await a.until((s) => s.phase === 'choosing', 'choosing');
  const drawer = a.state.turn.drawerId === a.state.me ? a : b;
  const guesser = drawer === a ? b : a;
  drawer.s.emit('word:choose', 0);
  await guesser.until((s) => s.phase === 'drawing', 'drawing');
  guesser.s.emit('chat', drawer.state.turn.word);
  await drawer.until((s) => s.phase === 'turnEnd', 'turn end');
  const score = drawer.state.players.find((p) => p.id === guesser.state.me).score;
  assert.ok(score > 0, 'guesser scored');

  // Guesser drops (e.g. phone locked).
  const token = guesser === a ? created.token : joined.token;
  guesser.s.disconnect();
  await drawer.until((s) => s.waitingUntil, 'game waits for players');
  assert.notEqual(drawer.state.phase, 'gameOver', 'game did not end on disconnect');
  const away = drawer.state.players.find((p) => p.id === guesser.state.me);
  assert.equal(away.connected, false);
  assert.equal(away.score, score, 'score kept while away');
  await sleep(8000); // longer than the turn-end screen: the game must hold, not move on
  assert.equal(drawer.state.phase, 'turnEnd', 'game paused between turns while short-handed');

  const back = player(guesser.name);
  const res = await back.emit('room:join', { code, token });
  assert.equal(res.id, guesser.state.me, 'same seat');
  await back.until((s) => !s.waitingUntil && s.players.find((p) => p.id === s.me).score === score, 'resumed with score');
  await back.until((s) => s.phase === 'choosing', 'next turn starts', 5000);
  console.log('✓ dropout: game pauses, score kept, resumes when they return');
  back.s.disconnect();
  drawer.s.disconnect();
}

async function drawerGraceTest() {
  // The drawer drops mid-drawing and comes back: the turn and the drawing survive.
  const ps = ['Fay', 'Gus', 'Hal'].map(player);
  const created = await ps[0].emit('room:create', { name: 'Fay' });
  const tokens = [created.token];
  for (const p of ps.slice(1)) tokens.push((await p.emit('room:join', { code: created.code, name: p.name })).token);
  await ps[0].until((s) => s.players.length === 3, '3 players');
  ps[0].s.emit('game:start');
  await ps[0].until((s) => s.phase === 'choosing', 'choosing');
  const di = ps.findIndex((p) => p.state.me === ps[0].state.turn.drawerId);
  const drawer = ps[di];
  drawer.s.emit('word:choose', 0);
  await drawer.until((s) => s.phase === 'drawing', 'drawing');
  const turnId = drawer.state.turn.id;
  drawer.s.emit('draw:op', { type: 'stroke', id: 'keep1', color: '#000000', size: 12, points: [100, 100] });
  await sleep(SETTLE);
  drawer.s.disconnect();
  await sleep(2500);
  const watcher = ps[(di + 1) % 3];
  assert.equal(watcher.state.phase, 'drawing', 'turn not skipped right away');
  assert.equal(watcher.state.turn.id, turnId);

  const back = player(drawer.name);
  let synced = null;
  back.s.on('draw:sync', (d) => (synced = d));
  const res = await back.emit('room:join', { code: created.code, token: tokens[di] });
  assert.equal(res.id, drawer.state.me);
  await back.until((s) => s.phase === 'drawing' && s.turn.word, 'drawer back mid-turn');
  await waitFor(() => synced?.ops.some((o) => o.id === 'keep1'), 'drawing restored on return');
  console.log('✓ drawer grace: turn kept and drawing restored when the drawer comes back');
  for (const p of [...ps, back]) p.s.disconnect();
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
  await waitFor(() => rival.chat.some((m) => m.type === 'private'), 'rival told to keep quiet');
  await sleep(SETTLE);
  assert.equal(host.state.phase, 'drawing', 'rival correct guess ignored');
  mate.s.emit('chat', word);
  await host.until((s) => s.phase === 'turnEnd', 'turn ends on teammate guess');
  assert.equal(host.state.turn.reveal.reason, 'guessed');
  assert.ok(host.state.teamScores[team] > 0, 'team scored');
  console.log(`✓ teams: only own team scores, steals blocked, team score ${host.state.teamScores[team]}`);
  for (const p of ps) p.s.disconnect();
}

async function wordTest() {
  // Big word bank, and no word is offered twice until the pool runs out.
  const { pickWords, TOTAL_WORDS, poolSize } = await import('../server/words.js');
  const { DEFAULT_SETTINGS } = await import('../shared/constants.js');
  assert.ok(TOTAL_WORDS > 2000, `word bank has ${TOTAL_WORDS} words`);
  const used = new Set();
  for (let i = 0; i < 300; i++) {
    for (const { word } of pickWords(DEFAULT_SETTINGS, used, 3)) {
      const key = word.toLowerCase();
      assert.ok(!used.has(key), `"${word}" was offered twice`);
      used.add(key);
    }
  }
  const animals = poolSize({ ...DEFAULT_SETTINGS, categories: ['animals'], difficulty: 'easy' });
  console.log(`✓ words: ${TOTAL_WORDS} total, 900 offers with no repeats (easy animals: ${animals})`);
}

try {
  await wordTest();
  await soloGame();
  await hintTest();
  await teamGame();
  await dropoutTest();
  await drawerGraceTest();
  await imposterTest();
  await cardsTest();
  await powerUpTest();
  console.log('\nAll smoke tests passed 🎉');
  process.exit(0);
} catch (err) {
  console.error('✗', err);
  process.exit(1);
}
