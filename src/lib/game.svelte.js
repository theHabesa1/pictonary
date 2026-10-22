import { tick } from 'svelte';
import { io } from 'socket.io-client';
import { AVATARS } from '../../shared/constants.js';
import { setMuted, sfx } from './sound.js';
import { getToken } from './token.js';

// The login token is sent on every (re)connect so the server knows who's signed in.
export const socket = io({
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  auth: (cb) => cb({ token: getToken() }),
});

const PROFILE_KEY = 'pictonary.profile';
const SESSION_KEY = 'pictonary.session';
const SEATS_KEY = 'pictonary.seats';
const MUTED_KEY = 'pictonary.muted';
const SEAT_TTL = 24 * 60 * 60_000;

// This tab's seat lives in sessionStorage (survives refresh). Every seat is also saved in
// localStorage (SEATS_KEY) so closing the tab or browser and reopening the invite link puts
// you straight back in your spot. Name, avatar and mute also live in localStorage.
const store = (key) => (key === SESSION_KEY ? sessionStorage : localStorage);

function load(key, fallback) {
  try {
    return JSON.parse(store(key).getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    if (value == null) store(key).removeItem(key);
    else store(key).setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — ignore */
  }
}

const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

export const urlCode = new URLSearchParams(location.search).get('r')?.toUpperCase() || null;

export const profile = $state({ name: '', avatar: randomAvatar(), ...load(PROFILE_KEY, {}) });

export const game = $state({
  connected: false,
  state: null, // latest room snapshot from the server
  messages: [],
  reactions: [],
  now: Date.now(), // server-synced clock, ticks 5x per second
  offset: 0,
  error: '',
  joining: false, // rejoining a saved seat
  seatConflict: null, // { code, name } when the saved seat is open in another tab/device
  splat: null, // { until, seed } while someone's (secret) 💦 Ink Splat covers our board
  powerToast: null, // { ok, text } private feedback after playing a power-up card
  muted: load(MUTED_KEY, false),
});
setMuted(game.muted);

setInterval(() => (game.now = Date.now() + game.offset), 200);

// ───────────────────────── saved seats ─────────────────────────

function loadSeats() {
  const seats = load(SEATS_KEY, {});
  for (const [code, seat] of Object.entries(seats)) if (Date.now() - seat.at > SEAT_TTL) delete seats[code];
  return seats;
}
function rememberSeat(code, token) {
  save(SEATS_KEY, { ...loadSeats(), [code]: { token, at: Date.now() } });
}
function forgetSeat(code) {
  const seats = loadSeats();
  delete seats[code];
  save(SEATS_KEY, seats);
}

/** Most recent saved seat, offered on the home page as "jump back in". */
export const lastSeat = () =>
  Object.entries(loadSeats())
    .map(([code, seat]) => ({ code, at: seat.at }))
    .sort((a, b) => b.at - a.at)[0] ?? null;

// `fromSaved`: the token came from another tab/visit, so don't steal the seat if it's live.
let session = load(SESSION_KEY, null);
if (urlCode && session?.code !== urlCode) {
  const seat = loadSeats()[urlCode];
  session = seat ? { code: urlCode, token: seat.token, fromSaved: true } : null;
}
let autoRejoin = !!(session && urlCode && session.code === urlCode);
if (autoRejoin) game.joining = true;

function setUrl(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('r', code);
  else url.searchParams.delete('r');
  history.replaceState(null, '', url);
}

function entered(res) {
  session = { code: res.code, token: res.token };
  save(SESSION_KEY, session);
  rememberSeat(res.code, res.token);
  setUrl(res.code);
  game.error = '';
  game.seatConflict = null;
}

function resetToHome(error = '', forget = true) {
  if (forget && session) forgetSeat(session.code);
  session = null;
  save(SESSION_KEY, null);
  game.state = null;
  game.messages = [];
  game.error = error;
  game.joining = false;
  setUrl(null);
}

function requestJoin(code, token, takeover) {
  return new Promise((resolve) => {
    socket.emit('room:join', { code, token, takeover, name: profile.name, avatar: profile.avatar }, (res) => {
      game.joining = false;
      if (res?.error === 'seat_active') {
        game.seatConflict = { code, name: res.name };
      } else if (res?.error) {
        forgetSeat(code);
        if (game.state) resetToHome(res.error);
        else game.error = res.error;
      } else {
        entered(res);
      }
      resolve(res);
    });
  });
}

export function saveProfile() {
  profile.name = profile.name.slice(0, 20);
  save(PROFILE_KEY, { name: profile.name, avatar: profile.avatar });
}

/** Create a room for `gameId` ('pictionary' | 'cards' | 'imposter'). */
export function createRoom(gameId = 'pictionary') {
  saveProfile();
  return new Promise((resolve) => {
    socket.emit('room:create', { name: profile.name, avatar: profile.avatar, game: gameId }, (res) => {
      if (res?.error) game.error = res.error;
      else entered(res);
      resolve(res);
    });
  });
}

/** Join by code. Reclaims your saved seat in that room if you have one. */
export function joinRoom(code) {
  saveProfile();
  code = code.toUpperCase();
  if (session?.code === code && !session.fromSaved) return requestJoin(code, session.token, true);
  const saved = loadSeats()[code];
  return requestJoin(code, saved?.token, false);
}

/** Seat is open in another tab/device: move it here. */
export function takeOverSeat() {
  const c = game.seatConflict;
  const saved = c && loadSeats()[c.code];
  if (!saved) return joinAsNewPlayer();
  game.joining = true;
  return requestJoin(c.code, saved.token, true);
}

/** Seat is open elsewhere, but this is a different person on the same device. */
export function joinAsNewPlayer() {
  const c = game.seatConflict;
  if (!c) return;
  game.seatConflict = null;
  session = null;
  saveProfile();
  return requestJoin(c.code, undefined, true);
}

function rejoin() {
  if (!session) return;
  game.joining = true;
  requestJoin(session.code, session.token, !session.fromSaved);
}

export function leaveRoom() {
  socket.emit('room:leave');
  resetToHome();
}

export function toggleMute() {
  game.muted = !game.muted;
  setMuted(game.muted);
  save(MUTED_KEY, game.muted);
}

export const send = (event, data) => socket.emit(event, data);

// ───────────────────────── socket events ─────────────────────────

socket.on('connect', () => {
  game.connected = true;
  if (autoRejoin || game.state) {
    autoRejoin = false;
    rejoin();
  }
});

socket.on('disconnect', () => (game.connected = false));

// Phones pause background tabs; reconnect right away when the game comes back on screen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
});

/**
 * Components can watch room updates: `before(prev, next)` runs while the screen still shows the
 * old state (to measure where things are), `after(prev, next)` once the screen has updated.
 */
export const stateHooks = new Set();

socket.on('state', (s) => {
  game.offset = s.serverNow - Date.now();
  game.now = s.serverNow;
  const prev = game.state;
  for (const h of stateHooks) h.before?.(prev, s);
  game.state = s;
  if (stateHooks.size) tick().then(() => stateHooks.forEach((h) => h.after?.(prev, s)));
  playTransitionSounds(prev, s);
});

socket.on('chat:history', (list) => (game.messages = list));

socket.on('chat', (msg) => {
  game.messages.push(msg);
  if (game.messages.length > 200) game.messages.splice(0, game.messages.length - 200);
  if (msg.type === 'correct') sfx('correct');
  else if (msg.type === 'close') sfx('close');
  else if (msg.type === 'join') sfx('pop');
  else if (msg.type === 'leave') sfx('leave');
  else if (msg.type === 'power') sfx('power');
});

// Power-up cards are secret: feedback arrives privately, never through the chat.
let toastTimer;
socket.on('power:result', ({ ok, text }) => {
  game.powerToast = { ok, text, id: Date.now() };
  if (ok) sfx('power');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (game.powerToast = null), 2800);
});

socket.on('splat', ({ ms, seed }) => {
  game.splat = { seed, until: Date.now() + ms };
  sfx('splat');
  setTimeout(() => {
    if (game.splat?.seed === seed) game.splat = null;
  }, ms);
});

let reactionId = 0;
socket.on('react', ({ emoji }) => {
  const id = ++reactionId;
  game.reactions.push({ id, emoji, x: 8 + Math.random() * 84 });
  setTimeout(() => {
    const i = game.reactions.findIndex((r) => r.id === id);
    if (i >= 0) game.reactions.splice(i, 1);
  }, 2600);
});

// `takeover`: the same seat moved to another tab/device — keep it saved for that one.
socket.on('kicked', ({ reason, takeover }) => resetToHome(reason, !takeover));

function playTransitionSounds(prev, s) {
  if (!prev) return;
  const me = s.me;
  if (s.phase === 'gameOver' && prev.phase !== 'gameOver') return sfx('fanfare');
  // 🕵️ Imposter
  if (s.imp) {
    if (s.imp.current === me && prev.imp?.current !== me) return sfx('yourTurn');
    if (s.phase === prev.phase) return;
    if (s.phase === 'clues' && prev.phase !== 'clues') return sfx('start');
    if (s.phase === 'vote') return sfx('hint');
    if (s.phase === 'guess') return sfx('close');
    if (s.phase === 'impReveal') return sfx(s.imp.reveal?.outcome === 'caught' ? 'correct' : 'reveal');
    return;
  }
  if (s.phase === 'turnEnd' && prev.phase !== 'turnEnd') return sfx('reveal');
  if (s.turn && s.turn.id !== prev.turn?.id) return sfx(s.turn.drawerId === me ? 'yourTurn' : 'pop');
  if (s.phase === 'drawing' && prev.phase === 'choosing') return sfx('start');
  if (s.turn && prev.turn && s.turn.hintsGiven > prev.turn.hintsGiven) return sfx('hint');
}
