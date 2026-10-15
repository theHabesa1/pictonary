import crypto from 'node:crypto';
import {
  AVATARS, CANVAS_H, CANVAS_W, CHOOSE_TIME, DEFAULT_SETTINGS, DIFFICULTY_MULT, MAX_PLAYERS,
  REACTIONS, TEAMS, TURN_END_TIME, isGuessChar, sanitizeSettings,
} from '../shared/constants.js';
import { CARDS_PER_GAME, EXTRA_TIME_SECONDS, POWERUPS, SPLAT_MS } from '../shared/powerups.js';
import { getInventory, recordGame, refundCard, useCard } from './accounts.js';
import { categoryLabel, pickWords, poolSize } from './words.js';

export const uid = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');

const MAX_OPS = 4000;
const MAX_STROKE_NUMBERS = 8000; // x,y pairs per stroke
const CHAT_LOG = 60;
// Disconnects: during a game a player's seat (and score) is kept until the game ends.
const LOBBY_GRACE_MS = 3 * 60_000; // in the lobby, free a disconnected player's seat after this
const DRAWER_GRACE_MS = 20_000; // a disconnected drawer gets this long to come back before we skip
const HOST_GRACE_MS = 30_000; // the host keeps the crown this long while disconnected
const SHORT_HANDED_MS = 90_000; // under 2 players online: wait this long for people before ending
const EMPTY_ROOM_MS = 30 * 60_000; // nobody online at all: delete the room after this

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
    this.usedWords = new Set(); // every word offered in this room, across games — avoids repeats
    this.teamScores = TEAMS.map(() => 0);
    this.teamCursor = TEAMS.map(() => 0);
    this.chatLog = [];
    this.gameOverReason = '';
    this.emptySince = 0;
    this.shortSince = 0; // when the game dropped below 2 online players
    this.missed = new Set(); // players whose turn came up while they were away this round
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

  join(socket, { name, avatar, token, takeover = true }) {
    const user = socket.data.user ?? null; // signed-in account, if any
    let p = token ? this.byToken.get(token) : null;
    // A seat that belongs to a different account isn't yours.
    if (p?.userId && p.userId !== user?.id) p = null;
    // Signed in on another device: find your seat by account.
    if (!p && user) p = [...this.players.values()].find((x) => x.userId === user.id) ?? null;
    if (p) {
      // Same person coming back (refresh, flaky wifi, reopened the link, new tab).
      const old = p.socketId && p.socketId !== socket.id ? this.io.sockets.sockets.get(p.socketId) : null;
      if (old) {
        // Seat is live somewhere else: ask before taking it over.
        if (!takeover) return { error: 'seat_active', name: p.name };
        old.leave(this.code);
        old.data.code = null;
        old.emit('kicked', { reason: 'You continued this game in another tab or device.', takeover: true });
      }
      const wasAway = !p.connected;
      p.connected = true;
      p.disconnectedAt = 0;
      p.socketId = socket.id;
      if (wasAway) this.system(`👋 ${p.name} is back!`, 'join');
      // Their turn came up while they were away: let them draw later this round.
      if (this.inGame() && this.missed.delete(p.id)) {
        if (!this.queue.includes(p.id)) this.queue.push(p.id);
        setTimeout(() => this.whisper(p.id, "Welcome back! You missed your turn, so you'll draw again later this round 🎨"), 300);
      }
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
        userId: null,
        level: null,
        cards: {}, // power-up inventory (signed-in players)
        cardsUsed: 0, // cards played this game
        correct: 0, // correct guesses this game
        drawn: 0, // own drawings someone guessed this game
      };
      this.players.set(p.id, p);
      this.byToken.set(p.token, p);
      this.system(`${p.name} joined the room`, 'join');
    }
    // Link (or unlink) the seat to the account the player is signed in with.
    p.userId = user?.id ?? null;
    p.level = user?.level ?? null;
    if (!user) p.cards = {};
    else this.refreshCards(p.id);

    socket.join(this.code);
    socket.data.code = this.code;
    socket.data.pid = p.id;
    if (!this.hostAvailable()) this.hostId = p.id;
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
    if (this.phase === 'lobby') this.system(`${p.name} left`, 'leave');
    else this.system(`📶 ${p.name} lost connection — their spot is saved`, 'leave');
    this.afterPlayerGone(p, false);
  }

  remove(pid, msg) {
    const p = this.players.get(pid);
    if (!p) return;
    this.players.delete(pid);
    this.byToken.delete(p.token);
    this.missed.delete(pid);
    if (p.connected && msg) this.system(msg, 'leave');
    p.connected = false;
    this.afterPlayerGone(p, true);
  }

  /** `left` = gone for good (Leave button / kicked); otherwise just disconnected. */
  afterPlayerGone(p, left) {
    this.ensureHost();
    // A drawer who only lost connection gets DRAWER_GRACE_MS to come back (see tick).
    if (left && this.turn?.drawerId === p.id && (this.phase === 'choosing' || this.phase === 'drawing')) {
      this.endTurn('drawer_left');
      return;
    }
    if (this.phase === 'drawing' && this.checkAllGuessed()) return;
    this.broadcast();
  }

  hostAvailable(now = Date.now()) {
    const h = this.players.get(this.hostId);
    return !!h && (h.connected || now - h.disconnectedAt < HOST_GRACE_MS);
  }

  /** Hand the crown to the longest-standing online player if the host is gone. */
  ensureHost(now = Date.now()) {
    if (this.hostAvailable(now)) return false;
    const next = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next || next.id === this.hostId) return false;
    this.hostId = next.id;
    this.system(`${next.name} is now the host 👑`);
    return true;
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
    for (const p of this.players.values()) Object.assign(p, { score: 0, cardsUsed: 0, correct: 0, drawn: 0 });
    this.teamScores = TEAMS.map(() => 0);
    this.teamCursor = TEAMS.map(() => 0);
    this.turnsPlayed = 0;
    this.round = 1;
    this.queue = this.buildQueue();
    this.gameOverReason = '';
    this.shortSince = 0;
    this.system(`🎨 Game on! ${this.settings.rounds} round${this.settings.rounds > 1 ? 's' : ''} — good luck!`);
    this.nextTurn();
  }

  /** Order of drawers for one round. In teams mode teams alternate and everyone draws once. */
  buildQueue() {
    // Everyone with a seat is queued; players who are away when their turn comes are skipped
    // (and get a turn later in the round if they come back in time).
    this.missed.clear();
    const players = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
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
        else if (p) this.missed.add(p.id);
      }
      if (drawer) break;
      this.round++;
      if (this.round > this.settings.rounds) return this.endGame();
      this.queue = this.buildQueue();
      if (!this.queue.length) return this.endGame();
    }
    if (!drawer) return this.endGame();

    const now = Date.now();
    const choices = pickWords(this.settings, this.usedWords, this.settings.wordChoices);
    // Offered-but-not-chosen words count as seen too, so the same options don't keep coming back.
    for (const c of choices) this.usedWords.add(c.word.toLowerCase());
    this.phase = 'choosing';
    this.turn = {
      id: ++this.turnCounter,
      drawerId: drawer.id,
      team: drawer.team,
      choices,
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
      category: null,
      // Power-up card effects for this turn:
      cardUsers: new Set(), // players who already played a card this turn
      peeks: new Map(), // pid -> Set of letter indexes revealed only to them (💡)
      catPeek: new Set(), // players who can see the category (🔍)
      doubles: new Set(), // players whose correct guess scores double (✌️)
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
    t.category = choice.category;
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
    // ✌️ Double Points card doubles the guesser's own points (not the drawer's share).
    const boost = (pts) => (t.doubles.has(p.id) ? pts * 2 : pts);
    p.correct++;
    if (t.guessed.size === 0 && drawer) drawer.drawn++;

    if (this.settings.mode === 'teams') {
      const base = round5((100 + 300 * timeLeft) * mult);
      const pts = boost(base);
      t.guessed.set(p.id, pts);
      award(p, pts);
      if (p.team === t.team || !this.drawerHasTeammates()) {
        award(drawer, round5(base * 0.5));
        this.system(`🎉 ${p.name} got it for the ${TEAMS[p.team].name}! +${pts}`, 'correct');
        this.endTurn('guessed', p);
      } else {
        this.system(`🦝 ${p.name} STOLE it for the ${TEAMS[p.team].name}! +${pts}`, 'correct');
        this.endTurn('stolen', p);
      }
      return;
    }

    const order = t.guessed.size;
    const base = round5((100 + 400 * timeLeft + ([60, 30, 15][order] ?? 0)) * mult);
    const pts = boost(base);
    t.guessed.set(p.id, pts);
    award(p, pts);
    award(drawer, round5(base * 0.35));
    this.system(`🎉 ${p.name} guessed the word! +${pts}${pts > base ? ' (✌️ doubled!)' : ''}`, 'correct');
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
      // Still seated, just disconnected: they get another go if they're back this round.
      this.missed.add(drawer.id);
      this.system(`📶 ${drawer.name} is still away, so we skip ahead. They'll get another turn if they're back this round`);
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
    if (t.word) this.turnsPlayed = (this.turnsPlayed ?? 0) + 1;
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
    this.missed.clear();
    this.shortSince = 0;
    this.gameOverReason = reason;
    this.system(reason ? `🏁 Game over — ${reason}` : '🏁 Game over! Thanks for playing 🎉');
    this.broadcast();
    // Stars are only paid for games that ran their full course (not ended early).
    if (!reason && (this.turnsPlayed ?? 0) >= 2 && this.players.size >= 2) this.payout();
  }

  /** Save each signed-in player's result and pay out ⭐ stars. */
  payout() {
    const players = [...this.players.values()];
    const teams = this.settings.mode === 'teams';
    const best = teams ? Math.max(...this.teamScores) : Math.max(...players.map((p) => p.score));
    for (const p of players) {
      if (!p.userId) continue;
      const mine = teams ? this.teamScores[p.team] : p.score;
      const place = 1 + (teams ? this.teamScores.filter((s) => s > mine).length : players.filter((x) => x.score > mine).length);
      const result = {
        mode: this.settings.mode,
        score: p.score,
        place,
        players: players.length,
        won: best > 0 && mine === best,
        correct: p.correct,
        drawn: p.drawn,
      };
      recordGame(p.userId, result)
        .then((rewards) => {
          if (!rewards) return;
          p.level = rewards.user.level;
          if (p.socketId) this.io.to(p.socketId).emit('rewards', rewards);
          this.broadcast();
        })
        .catch((err) => console.error('[payout]', err));
    }
  }

  // ───────────────────────── power-up cards ─────────────────────────

  /** A player signed in or out mid-room. */
  linkAccount(pid, user) {
    const p = this.players.get(pid);
    if (!p) return;
    p.userId = user?.id ?? null;
    p.level = user?.level ?? null;
    p.cards = {};
    if (user) this.refreshCards(pid);
    this.broadcast();
  }

  /** Reload a signed-in player's card inventory from the database. */
  async refreshCards(pid) {
    const p = this.players.get(pid);
    if (!p?.userId) return;
    try {
      p.cards = await getInventory(p.userId);
      this.broadcast();
    } catch (err) {
      console.error('[cards]', err);
    }
  }

  /** Why `p` can't play `card` right now (null = they can). */
  cardBlocker(p, card) {
    const t = this.turn;
    const def = POWERUPS[card];
    const isDrawer = t?.drawerId === p.id;
    if (!t) return 'Cards can only be played during a game.';
    if (def.when === 'choosing') {
      return this.phase === 'choosing' && isDrawer ? null : 'Play this while you pick your word.';
    }
    if (def.when === 'drawing') {
      return this.phase === 'drawing' && isDrawer ? null : 'Play this while you are drawing.';
    }
    if (this.phase !== 'drawing' || isDrawer) return 'Play this while someone else is drawing.';
    if (t.guessed.has(p.id)) return 'You already got this one!';
    if (card !== 'splat' && !this.canGuess(p)) return "It's not your team's turn to guess.";
    if (card === 'peek' && this.peekIndex(p) == null) return 'Not enough hidden letters left to peek at.';
    if (card === 'category' && t.catPeek.has(p.id)) return 'You already know the category.';
    return null;
  }

  async usePower(pid, card) {
    const p = this.players.get(pid);
    const def = POWERUPS[card];
    const t = this.turn;
    if (!p || !def) return;
    const fail = (msg) => this.whisper(pid, `🎴 ${msg}`);
    if (!this.settings.powerUps) return fail('Power-up cards are switched off in this room.');
    if (!p.userId) return fail('Sign in to earn ⭐ stars and collect power-up cards!');
    if (p.cardPending) return;
    if (t?.cardUsers.has(pid)) return fail('One card per turn — save the rest for later!');
    if (p.cardsUsed >= CARDS_PER_GAME) return fail(`You've played all ${CARDS_PER_GAME} of your cards for this game.`);
    const blocker = this.cardBlocker(p, card);
    if (blocker) return fail(blocker);

    p.cardPending = true;
    let left = null;
    try {
      left = await useCard(p.userId, card);
    } catch (err) {
      console.error('[cards]', err);
      return fail("Couldn't play that card just now. Try again!");
    } finally {
      p.cardPending = false;
    }
    if (left === null) {
      p.cards[card] = 0;
      this.broadcast();
      return fail(`You don't have any ${def.name} cards. Get some in the ⭐ shop!`);
    }
    // The game may have moved on while we were talking to the database.
    const late = this.turn !== t ? 'Too late — that turn is over.' : this.cardBlocker(p, card);
    if (late) {
      refundCard(p.userId, card).catch((err) => console.error('[cards]', err));
      return fail(`${late} (card refunded)`);
    }
    p.cards[card] = left;
    p.cardsUsed++;
    t.cardUsers.add(pid);
    this.applyPower(p, card);
  }

  applyPower(p, card) {
    const t = this.turn;
    const def = POWERUPS[card];
    this.system(`🎴 ${p.name} played ${def.emoji} ${def.name}!`, 'power');
    switch (card) {
      case 'category':
        t.catPeek.add(p.id);
        this.whisper(p.id, `🔍 The word is from: ${categoryLabel(t.category)}`);
        break;
      case 'peek': {
        const idx = this.peekIndex(p);
        if (!t.peeks.has(p.id)) t.peeks.set(p.id, new Set());
        t.peeks.get(p.id).add(idx);
        break;
      }
      case 'double':
        t.doubles.add(p.id);
        break;
      case 'reroll':
        t.choices = pickWords(this.settings, this.usedWords, this.settings.wordChoices);
        for (const c of t.choices) this.usedWords.add(c.word.toLowerCase());
        t.endsAt = Date.now() + CHOOSE_TIME * 1000;
        t.duration = CHOOSE_TIME;
        break;
      case 'time':
        t.endsAt += EXTRA_TIME_SECONDS * 1000;
        t.duration += EXTRA_TIME_SECONDS;
        break;
      case 'splat':
        // Everyone except you, the drawer and your own teammates gets ink on their screen.
        for (const x of this.connectedPlayers()) {
          if (x.id === p.id || x.id === t.drawerId) continue;
          if (this.settings.mode === 'teams' && x.team === p.team) continue;
          this.io.to(x.socketId).emit('splat', { by: p.name, ms: SPLAT_MS, seed: Math.random() });
        }
        break;
    }
    this.broadcast();
  }

  /** A random letter still hidden from `p` — keeping at least one letter hidden. */
  peekIndex(p) {
    const t = this.turn;
    if (!t?.word) return null;
    const mine = t.peeks.get(p.id);
    const hidden = Array.from(t.word)
      .map((c, i) => (isGuessChar(c) && !t.revealed.includes(i) && !mine?.has(i) ? i : -1))
      .filter((i) => i >= 0);
    return hidden.length >= 2 ? hidden[Math.floor(Math.random() * hidden.length)] : null;
  }

  backToLobby(pid) {
    if (pid !== this.hostId) return;
    if (this.inGame()) this.system('The host ended the game');
    this.phase = 'lobby';
    this.turn = null;
    this.ops = [];
    this.queue = [];
    this.missed.clear();
    this.shortSince = 0;
    this.round = 0;
    for (const p of this.players.values()) p.score = 0;
    this.teamScores = TEAMS.map(() => 0);
    this.broadcast();
  }

  /** Called ~4x per second by the server loop. Returns false when the room can be deleted. */
  tick(now) {
    const t = this.turn;
    const online = this.connectedPlayers().length;
    const drawer = t && this.players.get(t.drawerId);
    const drawerGone = !drawer || (!drawer.connected && now - drawer.disconnectedAt > DRAWER_GRACE_MS);

    if (this.phase === 'choosing' && t && (now >= t.endsAt || drawerGone)) {
      if (drawer?.connected) this.startDrawing(t.choices[Math.floor(Math.random() * t.choices.length)]);
      else this.endTurn('drawer_left');
    } else if (this.phase === 'drawing' && t) {
      let changed = false;
      while (t.revealed.length < t.revealOrder.length && now >= t.hintTimes[t.revealed.length]) {
        t.revealed.push(t.revealOrder[t.revealed.length]);
        changed = true;
      }
      if (drawerGone) this.endTurn('drawer_left');
      else if (now >= t.endsAt) this.endTurn('time');
      else if (changed) this.broadcast();
    } else if (this.phase === 'turnEnd' && t && now >= t.endsAt && online >= 2) {
      this.nextTurn();
    }

    // Fewer than 2 people online mid-game: pause between turns and give them time to reconnect.
    if (this.inGame() && online < 2) {
      if (!this.shortSince) {
        this.shortSince = now;
        this.broadcast();
      } else if (now - this.shortSince > SHORT_HANDED_MS) {
        this.endGame('Not enough players came back in time.');
      }
    } else if (this.shortSince) {
      this.shortSince = 0;
      this.broadcast();
    }

    if (this.ensureHost(now)) this.broadcast();

    // In the lobby, free seats of people who left a while ago. During a game (and on the
    // results screen) seats are kept, so anyone can come back until the game is over.
    if (this.phase === 'lobby') {
      for (const p of [...this.players.values()]) {
        if (!p.connected && now - p.disconnectedAt > LOBBY_GRACE_MS) this.remove(p.id);
      }
    }

    if (!online) {
      this.emptySince ||= now;
      if (now - this.emptySince > EMPTY_ROOM_MS || !this.players.size) return false;
    } else {
      this.emptySince = 0;
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
      // Letters revealed to everyone by hints, plus any this player peeked at with 💡.
      const revealed = new Set([...t.revealed, ...(t.peeks.get(me.id) ?? [])]);
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
        category: t.word && (t.catPeek.has(me.id) || knows) ? categoryLabel(t.category) : null,
        peeked: t.peeks.get(me.id)?.size ?? 0,
        doubled: t.doubles.has(me.id),
        cardPlayed: t.cardUsers.has(me.id),
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
      wordPool: poolSize(this.settings),
      // Set while the game is paused waiting for disconnected players to come back.
      waitingUntil: this.shortSince ? this.shortSince + SHORT_HANDED_MS : null,
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
          level: p.level, // null for guests
        })),
      // This player's power-up cards (null = guest, not signed in).
      cards: me.userId ? me.cards : null,
      cardsLeft: CARDS_PER_GAME - me.cardsUsed,
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
