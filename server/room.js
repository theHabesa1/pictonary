import crypto from 'node:crypto';
import {
  AVATARS, CANVAS_H, CANVAS_W, CHOOSE_TIME, DEFAULT_SETTINGS, DIFFICULTY_MULT, MAX_PLAYERS,
  REACTIONS, TEAMS, TURN_END_TIME, isGuessChar, sanitizeSettings,
} from '../shared/constants.js';
import { pickWords } from './words.js';

export const uid = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');

const MAX_OPS = 4000;
const MAX_STROKE_NUMBERS = 8000; // x,y pairs per stroke
const CHAT_LOG = 60;
const LOBBY_GRACE_MS = 30_000; // keep a disconnected player's seat this long in the lobby
const GAME_GRACE_MS = 5 * 60_000; // ...and this long during a game (so refreshes don't lose points)

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function cleanName(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || 'Player';
}

const cleanAvatar = (a) => (AVATARS.includes(a) ? a : AVATARS[Math.floor(Math.random() * AVATARS.length)]);

const cleanColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

function cleanPoints(arr, max) {
  if (!Array.isArray(arr) || arr.length % 2 !== 0 || arr.length > max) return null;
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i += 2) {
    const x = Number(arr[i]);
    const y = Number(arr[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out[i] = Math.round(Math.min(CANVAS_W, Math.max(0, x)));
    out[i + 1] = Math.round(Math.min(CANVAS_H, Math.max(0, y)));
  }
  return out;
}

export class Room {
  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.players = new Map(); // id -> player
    this.byToken = new Map(); // secret token -> player
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = 'lobby'; // lobby | choosing | drawing | turnEnd | gameOver
    this.round = 0;
    this.queue = [];
    this.turn = null;
    this.turnCounter = 0;
    this.ops = [];
    this.usedWords = new Set();
    this.teamScores = TEAMS.map(() => 0);
    this.teamCursor = TEAMS.map(() => 0);
    this.chatLog = [];
    this.gameOverReason = '';
    this.emptySince = 0;
  }

  // ───────────────────────── players ─────────────────────────

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  smallestTeam(exceptId) {
    const counts = Array(this.settings.teamCount).fill(0);
    for (const p of this.players.values()) {
      if (p.id !== exceptId && p.team < counts.length) counts[p.team]++;
    }
    return counts.indexOf(Math.min(...counts));
  }

  join(socket, { name, avatar, token }) {
    let p = token ? this.byToken.get(token) : null;
    if (p) {
      // Same person coming back (refresh, flaky wifi, new tab).
      if (p.socketId && p.socketId !== socket.id) {
        const old = this.io.sockets.sockets.get(p.socketId);
        if (old) {
          old.leave(this.code);
          old.data.code = null;
          old.emit('kicked', { reason: 'You opened the game in another tab.' });
        }
      }
      const wasAway = !p.connected;
      p.connected = true;
      p.disconnectedAt = 0;
      p.socketId = socket.id;
      if (wasAway) this.system(`${p.name} is back`, 'join');
    } else {
      if (this.players.size >= MAX_PLAYERS) return { error: `This room is full (${MAX_PLAYERS} players max).` };
      let base = cleanName(name);
      let finalName = base;
      const names = new Set([...this.players.values()].map((x) => x.name.toLowerCase()));
      for (let i = 2; names.has(finalName.toLowerCase()); i++) finalName = `${base.slice(0, 17)} ${i}`;
      p = {
        id: uid(6),
        token: uid(18),
        name: finalName,
        avatar: cleanAvatar(avatar),
        team: this.smallestTeam(),
        score: 0,
        connected: true,
        socketId: socket.id,
        joinedAt: Date.now(),
        disconnectedAt: 0,
        chatTimes: [],
        lastReact: 0,
      };
      this.players.set(p.id, p);
      this.byToken.set(p.token, p);
      this.system(`${p.name} joined the room`, 'join');
    }

    socket.join(this.code);
    socket.data.code = this.code;
    socket.data.pid = p.id;
    if (!this.players.get(this.hostId)?.connected) this.hostId = p.id;
    this.emptySince = 0;

    socket.emit('chat:history', this.chatLog);
    this.broadcast();
    socket.emit('draw:sync', { turnId: this.turn?.id ?? null, ops: this.ops });
    return { ok: true, code: this.code, token: p.token, id: p.id };
  }

  disconnect(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = Date.now();
    this.system(`${p.name} left`, 'leave');
    this.afterPlayerGone(p);
  }

  remove(pid, msg) {
    const p = this.players.get(pid);
    if (!p) return;
    this.players.delete(pid);
    this.byToken.delete(p.token);
    if (p.connected && msg) this.system(msg, 'leave');
    p.connected = false;
    this.afterPlayerGone(p);
  }

  afterPlayerGone(p) {
    if (this.hostId === p.id || !this.players.get(this.hostId)?.connected) {
      const next = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        if (next.id !== this.hostId) this.system(`${next.name} is now the host 👑`);
        this.hostId = next.id;
      }
    }
    if (this.inGame()) {
      if (this.connectedPlayers().length < 2) {
        this.endGame('Not enough players left to keep going.');
        return;
      }
      if (this.turn?.drawerId === p.id && (this.phase === 'choosing' || this.phase === 'drawing')) {
        this.endTurn('drawer_left');
        return;
      }
      if (this.phase === 'drawing') this.checkAllGuessed();
    }
    this.broadcast();
  }

  inGame() {
    return this.phase === 'choosing' || this.phase === 'drawing' || this.phase === 'turnEnd';
  }

  // ───────────────────────── lobby actions ─────────────────────────

  updateSettings(pid, patch) {
    if (pid !== this.hostId || this.phase !== 'lobby') return;
    this.settings = sanitizeSettings(patch, this.settings);
    // Players sitting in a team that no longer exists move to the smallest one.
    for (const p of this.players.values()) {
      if (p.team >= this.settings.teamCount) p.team = this.smallestTeam(p.id);
    }
    this.broadcast();
  }

  setTeam(pid, team, targetId) {
    if (this.phase !== 'lobby' && this.phase !== 'gameOver') return;
    const who = targetId && pid === this.hostId ? targetId : pid;
    const p = this.players.get(who);
    const t = Math.round(Number(team));
    if (!p || !(t >= 0 && t < this.settings.teamCount)) return;
    p.team = t;
    this.broadcast();
  }

  shuffleTeams(pid) {
    if (pid !== this.hostId || (this.phase !== 'lobby' && this.phase !== 'gameOver')) return;
    shuffle([...this.players.values()]).forEach((p, i) => (p.team = i % this.settings.teamCount));
    this.system('Teams were shuffled 🔀');
    this.broadcast();
  }

  kick(pid, targetId) {
    if (pid !== this.hostId || targetId === pid) return;
    const p = this.players.get(targetId);
    if (!p) return;
    const sock = p.socketId && this.io.sockets.sockets.get(p.socketId);
    if (sock) {
      sock.emit('kicked', { reason: 'The host removed you from the room.' });
      sock.leave(this.code);
      sock.data.code = null;
    }
    this.remove(targetId, `${p.name} was removed by the host`);
  }

  // ───────────────────────── game flow ─────────────────────────

  start(pid) {
    if (pid !== this.hostId || this.inGame()) return;
    if (this.connectedPlayers().length < 2) {
      this.whisper(pid, 'You need at least 2 players to start. Share the invite link! 🔗');
      return;
    }
    // Drop seats of people who are gone before a fresh game.
    for (const p of [...this.players.values()]) if (!p.connected) this.remove(p.id);
    for (const p of this.players.values()) p.score = 0;
    this.teamScores = TEAMS.map(() => 0);
    this.teamCursor = TEAMS.map(() => 0);
    this.usedWords.clear();
    this.round = 1;
    this.queue = this.buildQueue();
    this.gameOverReason = '';
    this.system(`🎨 Game on! ${this.settings.rounds} round${this.settings.rounds > 1 ? 's' : ''} — good luck!`);
    this.nextTurn();
  }

  /** Order of drawers for one round. In teams mode teams alternate and everyone draws once. */
  buildQueue() {
    const players = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt);
    if (this.settings.mode !== 'teams') return players.map((p) => p.id);
    const groups = [];
    for (let t = 0; t < this.settings.teamCount; t++) {
      const members = players.filter((p) => p.team === t);
      if (members.length) groups.push({ t, members });
    }
    const size = Math.max(0, ...groups.map((g) => g.members.length));
    const queue = [];
    for (let i = 0; i < size; i++) {
      for (const g of groups) queue.push(g.members[(this.teamCursor[g.t] + i) % g.members.length].id);
    }
    for (const g of groups) this.teamCursor[g.t] += size;
    return queue;
  }

  nextTurn() {
    this.ops = [];
    let drawer = null;
    for (let guard = 0; guard < 50 && !drawer; guard++) {
      while (this.queue.length && !drawer) {
        const p = this.players.get(this.queue.shift());
        if (p?.connected) drawer = p;
      }
      if (drawer) break;
      this.round++;
      if (this.round > this.settings.rounds) return this.endGame();
      this.queue = this.buildQueue();
      if (!this.queue.length) return this.endGame();
    }
    if (!drawer) return this.endGame();

    const now = Date.now();
    this.phase = 'choosing';
    this.turn = {
      id: ++this.turnCounter,
      drawerId: drawer.id,
      team: drawer.team,
      choices: pickWords(this.settings, this.usedWords, this.settings.wordChoices),
      word: null,
      difficulty: null,
      startedAt: now,
      endsAt: now + CHOOSE_TIME * 1000,
      duration: CHOOSE_TIME,
      revealOrder: [],
      revealed: [],
      hintTimes: [],
      guessed: new Map(), // pid -> points earned by guessing
      gains: new Map(), // pid -> total points earned this turn
      reveal: null,
    };
    this.broadcast();
  }

  chooseWord(pid, index) {
    const t = this.turn;
    if (this.phase !== 'choosing' || !t || t.drawerId !== pid) return;
    const choice = t.choices[Math.round(Number(index))];
    if (choice) this.startDrawing(choice);
  }

  startDrawing(choice) {
    const t = this.turn;
    const now = Date.now();
    const chars = Array.from(choice.word);
    const letterIdx = chars.map((c, i) => (isGuessChar(c) ? i : -1)).filter((i) => i >= 0);
    const hintCount = Math.min(this.settings.hints, Math.floor(letterIdx.length / 2));
    const duration = this.settings.drawTime;

    t.word = choice.word;
    t.difficulty = choice.difficulty;
    t.startedAt = now;
    t.duration = duration;
    t.endsAt = now + duration * 1000;
    t.revealOrder = shuffle(letterIdx).slice(0, hintCount);
    // Spread the hints evenly over the turn: e.g. 3 hints → at 25%, 50%, 75% of the time.
    t.hintTimes = t.revealOrder.map((_, i) => now + (duration * 1000 * (i + 1)) / (hintCount + 1));
    t.revealed = [];
    this.usedWords.add(choice.word.toLowerCase());
    this.phase = 'drawing';
    this.ops = [];
    this.broadcast();
  }

  /** Can this player score on the current turn? (teams: own team, or steals) */
  canGuess(p) {
    const t = this.turn;
    if (!t || p.id === t.drawerId) return false;
    if (this.settings.mode !== 'teams') return true;
    if (p.team === t.team || this.settings.allowSteals) return true;
    // Drawer has no teammates online → let everyone play so the turn isn't wasted.
    return !this.drawerHasTeammates();
  }

  drawerHasTeammates() {
    const t = this.turn;
    return this.connectedPlayers().some((x) => x.team === t.team && x.id !== t.drawerId);
  }

  correctGuess(p) {
    const t = this.turn;
    const drawer = this.players.get(t.drawerId);
    const timeLeft = Math.max(0, t.endsAt - Date.now()) / (t.duration * 1000);
    const mult = DIFFICULTY_MULT[t.difficulty] ?? 1;
    const award = (who, pts) => {
      if (!who) return;
      who.score += pts;
      t.gains.set(who.id, (t.gains.get(who.id) ?? 0) + pts);
      if (this.settings.mode === 'teams') this.teamScores[who.team] += pts;
    };

    if (this.settings.mode === 'teams') {
      const pts = round5((100 + 300 * timeLeft) * mult);
      t.guessed.set(p.id, pts);
      award(p, pts);
      if (p.team === t.team || !this.drawerHasTeammates()) {
        award(drawer, round5(pts * 0.5));
        this.system(`🎉 ${p.name} got it for the ${TEAMS[p.team].name}! +${pts}`, 'correct');
        this.endTurn('guessed', p);
      } else {
        this.system(`🦝 ${p.name} STOLE it for the ${TEAMS[p.team].name}! +${pts}`, 'correct');
        this.endTurn('stolen', p);
      }
      return;
    }

    const order = t.guessed.size;
    const pts = round5((100 + 400 * timeLeft + ([60, 30, 15][order] ?? 0)) * mult);
    t.guessed.set(p.id, pts);
    award(p, pts);
    award(drawer, round5(pts * 0.35));
    this.system(`🎉 ${p.name} guessed the word! +${pts}`, 'correct');
    if (!this.checkAllGuessed()) this.broadcast();
  }

  checkAllGuessed() {
    if (this.phase !== 'drawing' || this.settings.mode === 'teams') return false;
    const t = this.turn;
    const guessers = this.connectedPlayers().filter((p) => p.id !== t.drawerId);
    if (guessers.length && guessers.every((p) => t.guessed.has(p.id))) {
      this.endTurn('all_guessed');
      return true;
    }
    return false;
  }

  endTurn(reason, by) {
    const t = this.turn;
    if (!t) return;
    const drawer = this.players.get(t.drawerId);
    const short = !t.word; // nothing to reveal (drawer left before choosing / skipped)
    if (reason === 'time' && this.settings.mode === 'solo' && t.guessed.size === 0) {
      this.system(`⏰ Time's up! Nobody got it. The word was "${t.word}"`);
    } else if (reason === 'time') {
      this.system(`⏰ Time's up! The word was "${t.word}"`);
    } else if (reason === 'all_guessed') {
      this.system(`✨ Everyone guessed it! The word was "${t.word}"`);
    } else if (reason === 'drawer_left' && drawer) {
      this.system(`${drawer.name} left, so we skip to the next turn`);
    } else if (reason === 'drawer_left') {
      this.system('The drawer left, so we skip to the next turn');
    } else if (reason === 'skipped') {
      this.system(`⏭️ Turn skipped${t.word ? `. The word was "${t.word}"` : ''}`);
    }

    t.reveal = {
      word: t.word,
      reason,
      by: by ? { id: by.id, name: by.name, team: by.team } : null,
      gains: [...t.gains.entries()].map(([id, pts]) => ({ id, pts })).sort((a, b) => b.pts - a.pts),
    };
    this.phase = 'turnEnd';
    t.endsAt = Date.now() + (short ? 2500 : TURN_END_TIME * 1000);
    t.duration = short ? 2.5 : TURN_END_TIME;
    this.broadcast();
  }

  skip(pid) {
    const t = this.turn;
    if (!t || (pid !== this.hostId && pid !== t.drawerId)) return;
    if (this.phase === 'choosing' || this.phase === 'drawing') this.endTurn('skipped');
  }

  endGame(reason = '') {
    this.phase = 'gameOver';
    this.turn = null;
    this.ops = [];
    this.queue = [];
    this.gameOverReason = reason;
    this.system(reason ? `🏁 Game over — ${reason}` : '🏁 Game over! Thanks for playing 🎉');
    this.broadcast();
  }

  backToLobby(pid) {
    if (pid !== this.hostId) return;
    if (this.inGame()) this.system('The host ended the game');
    this.phase = 'lobby';
    this.turn = null;
    this.ops = [];
    this.queue = [];
    this.round = 0;
    for (const p of this.players.values()) p.score = 0;
    this.teamScores = TEAMS.map(() => 0);
    this.broadcast();
  }

  /** Called ~4x per second by the server loop. Returns false when the room can be deleted. */
  tick(now) {
    const t = this.turn;
    if (this.phase === 'choosing' && t && now >= t.endsAt) {
      this.startDrawing(t.choices[Math.floor(Math.random() * t.choices.length)]);
    } else if (this.phase === 'drawing' && t) {
      let changed = false;
      while (t.revealed.length < t.revealOrder.length && now >= t.hintTimes[t.revealed.length]) {
        t.revealed.push(t.revealOrder[t.revealed.length]);
        changed = true;
      }
      if (now >= t.endsAt) this.endTurn('time');
      else if (changed) this.broadcast();
    } else if (this.phase === 'turnEnd' && t && now >= t.endsAt) {
      this.nextTurn();
    }

    // Forget seats of people who have been gone too long.
    const grace = this.inGame() ? GAME_GRACE_MS : LOBBY_GRACE_MS;
    for (const p of [...this.players.values()]) {
      if (!p.connected && now - p.disconnectedAt > grace) this.remove(p.id);
    }

    if (!this.connectedPlayers().length) {
      this.emptySince ||= now;
      if (now - this.emptySince > 10 * 60_000 || !this.players.size) return false;
    }
    return true;
  }

  // ───────────────────────── chat & guessing ─────────────────────────

  chat(pid, text) {
    const p = this.players.get(pid);
    if (!p || typeof text !== 'string') return;
    const msg = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!msg) return;

    const now = Date.now();
    p.chatTimes = p.chatTimes.filter((x) => now - x < 4000);
    if (p.chatTimes.length >= 6) return this.whisper(pid, 'Whoa, slow down a little! 🐢');
    p.chatTimes.push(now);

    const t = this.turn;
    const base = { id: uid(6), type: 'chat', pid: p.id, name: p.name, avatar: p.avatar, team: p.team, text: msg };

    if (this.phase === 'drawing' && t?.word) {
      // The drawer and people who already know the word talk in a private channel.
      if (p.id === t.drawerId || t.guessed.has(p.id)) {
        return this.sendToKnowers({ ...base, channel: 'guessed' });
      }
      const g = normalize(msg);
      const w = normalize(t.word);
      const correct = g === w || g.replace(/ /g, '') === w.replace(/ /g, '') || ` ${g} `.includes(` ${w} `);
      if (correct) {
        if (this.canGuess(p)) return this.correctGuess(p);
        return this.whisper(pid, "🤫 That's it! But it's not your team's turn — keep it secret!");
      }
      this.publish(base);
      const a = g.replace(/ /g, '');
      const b = w.replace(/ /g, '');
      if (this.canGuess(p) && a.length >= 3 && levenshtein(a, b) <= (b.length >= 7 ? 2 : 1)) {
        this.whisper(pid, `🔥 "${msg}" is very close!`, 'close');
      }
      return;
    }
    this.publish(base);
  }

  react(pid, emoji) {
    const p = this.players.get(pid);
    const now = Date.now();
    if (!p || !REACTIONS.includes(emoji) || now - p.lastReact < 350) return;
    p.lastReact = now;
    this.io.to(this.code).emit('react', { emoji, pid });
  }

  publish(msg) {
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.io.to(this.code).emit('chat', msg);
  }

  system(text, type = 'system') {
    this.publish({ id: uid(6), type, text });
  }

  whisper(pid, text, type = 'private') {
    const sid = this.players.get(pid)?.socketId;
    if (sid) this.io.to(sid).emit('chat', { id: uid(6), type, text });
  }

  sendToKnowers(msg) {
    const t = this.turn;
    for (const p of this.players.values()) {
      if (p.socketId && (p.id === t.drawerId || t.guessed.has(p.id))) this.io.to(p.socketId).emit('chat', msg);
    }
  }

  // ───────────────────────── drawing ─────────────────────────

  isDrawing(pid) {
    return this.phase === 'drawing' && this.turn?.drawerId === pid;
  }

  drawOp(socket, pid, op) {
    if (!this.isDrawing(pid) || this.ops.length >= MAX_OPS || !op) return;
    const color = cleanColor(op.color);
    const size = Math.round(Number(op.size));
    const points = cleanPoints(op.points, 2);
    if (!color || !(size >= 1 && size <= 120) || !points?.length || typeof op.id !== 'string') return;
    const clean = { type: 'stroke', id: op.id.slice(0, 24), color, size, points };
    this.ops.push(clean);
    socket.to(this.code).emit('draw:op', clean);
  }

  drawPoints(socket, pid, data) {
    if (!this.isDrawing(pid) || !data) return;
    const op = this.findStroke(data.id);
    const points = cleanPoints(data.points, 1200);
    if (!op || !points?.length || op.points.length + points.length > MAX_STROKE_NUMBERS) return;
    op.points.push(...points);
    socket.to(this.code).emit('draw:pts', { id: op.id, points });
  }

  findStroke(id) {
    for (let i = this.ops.length - 1; i >= Math.max(0, this.ops.length - 5); i--) {
      if (this.ops[i].id === id) return this.ops[i];
    }
    return null;
  }

  drawFill(socket, pid, data) {
    if (!this.isDrawing(pid) || this.ops.length >= MAX_OPS || !data) return;
    const color = cleanColor(data.color);
    const pt = cleanPoints([data.x, data.y], 2);
    if (!color || !pt) return;
    const op = { type: 'fill', x: Math.min(CANVAS_W - 1, pt[0]), y: Math.min(CANVAS_H - 1, pt[1]), color };
    this.ops.push(op);
    socket.to(this.code).emit('draw:fill', op);
  }

  drawUndo(socket, pid) {
    if (!this.isDrawing(pid) || !this.ops.length) return;
    this.ops.pop();
    socket.to(this.code).emit('draw:undo');
  }

  drawClear(socket, pid) {
    if (!this.isDrawing(pid) || this.ops.length >= MAX_OPS) return;
    this.ops.push({ type: 'clear' });
    socket.to(this.code).emit('draw:clear');
  }

  // ───────────────────────── state sync ─────────────────────────

  snapshot(me) {
    const t = this.turn;
    const isDrawer = t?.drawerId === me.id;
    let turn = null;
    if (t) {
      const knows = isDrawer || t.guessed.has(me.id) || this.phase === 'turnEnd';
      const revealed = new Set(t.revealed);
      turn = {
        id: t.id,
        drawerId: t.drawerId,
        team: t.team,
        endsAt: t.endsAt,
        duration: t.duration,
        choices: isDrawer && this.phase === 'choosing' ? t.choices : null,
        word: knows ? t.word : null,
        mask: t.word ? Array.from(t.word).map((c, i) => (isGuessChar(c) && !revealed.has(i) ? null : c)) : null,
        difficulty: t.word ? t.difficulty : null,
        hintsGiven: t.revealed.length,
        hintsTotal: t.revealOrder.length,
        canGuess: this.canGuess(me),
        reveal: this.phase === 'turnEnd' ? t.reveal : null,
      };
    }
    return {
      code: this.code,
      me: me.id,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      teamScores: this.teamScores,
      gameOverReason: this.gameOverReason,
      players: [...this.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          team: p.team,
          score: p.score,
          connected: p.connected,
          guessed: !!t?.guessed.has(p.id),
        })),
      turn,
      serverNow: Date.now(),
    };
  }

  broadcast() {
    for (const p of this.players.values()) {
      if (p.socketId) this.io.to(p.socketId).emit('state', this.snapshot(p));
    }
  }
}
