import { io } from 'socket.io-client';
import { AVATARS } from '../../shared/constants.js';
import { setMuted, sfx } from './sound.js';

export const socket = io();

const PROFILE_KEY = 'pictonary.profile';
const SESSION_KEY = 'pictonary.session';
const MUTED_KEY = 'pictonary.muted';

// The room seat lives in sessionStorage (one player per tab, survives refresh);
// name, avatar and mute live in localStorage.
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
  joining: false,
  muted: load(MUTED_KEY, false),
});
setMuted(game.muted);

setInterval(() => (game.now = Date.now() + game.offset), 200);

let session = load(SESSION_KEY, null);
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
  setUrl(res.code);
  game.error = '';
}

function resetToHome(error = '') {
  session = null;
  save(SESSION_KEY, null);
  game.state = null;
  game.messages = [];
  game.error = error;
  setUrl(null);
}

export function saveProfile() {
  profile.name = profile.name.slice(0, 20);
  save(PROFILE_KEY, { name: profile.name, avatar: profile.avatar });
}

export function createRoom() {
  saveProfile();
  return new Promise((resolve) => {
    socket.emit('room:create', { name: profile.name, avatar: profile.avatar }, (res) => {
      if (res?.error) game.error = res.error;
      else entered(res);
      resolve(res);
    });
  });
}

export function joinRoom(code) {
  saveProfile();
  const token = session?.code === code.toUpperCase() ? session.token : undefined;
  return new Promise((resolve) => {
    socket.emit('room:join', { code, token, name: profile.name, avatar: profile.avatar }, (res) => {
      if (res?.error) game.error = res.error;
      else entered(res);
      resolve(res);
    });
  });
}

function rejoin() {
  if (!session) return;
  game.joining = true;
  socket.emit('room:join', { ...session, name: profile.name, avatar: profile.avatar }, (res) => {
    game.joining = false;
    if (res?.error) resetToHome(res.error);
    else entered(res);
  });
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

socket.on('state', (s) => {
  game.offset = s.serverNow - Date.now();
  game.now = s.serverNow;
  const prev = game.state;
  game.state = s;
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

socket.on('kicked', ({ reason }) => resetToHome(reason));

function playTransitionSounds(prev, s) {
  if (!prev) return;
  const me = s.me;
  if (s.phase === 'gameOver' && prev.phase !== 'gameOver') return sfx('fanfare');
  if (s.phase === 'turnEnd' && prev.phase !== 'turnEnd') return sfx('reveal');
  if (s.turn && s.turn.id !== prev.turn?.id) return sfx(s.turn.drawerId === me ? 'yourTurn' : 'pop');
  if (s.phase === 'drawing' && prev.phase === 'choosing') return sfx('start');
  if (s.turn && prev.turn && s.turn.hintsGiven > prev.turn.hintsGiven) return sfx('hint');
}
