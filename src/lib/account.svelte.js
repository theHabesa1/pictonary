// Signed-in account: profile, stars, power-up cards, stats and the shop.
import { profile, saveProfile, socket } from './game.svelte.js';
import { getToken, setToken } from './token.js';

export const account = $state({
  user: null, // { username, displayName, avatar, stars, xp, level, gamesPlayed, … }
  inventory: {}, // { cardId: qty }
  history: [],
  leaderboard: [],
  checking: !!getToken(), // loading the account on startup
  modal: null, // null | 'signin' | 'signup' | 'profile' | 'shop' | 'leaders'
  rewards: null, // stars earned in the game that just finished
});

async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Tell the game server who we are now (no reconnect needed). */
function announce() {
  socket.emit('auth', getToken() ?? null, () => {});
}

function applyUser(user) {
  account.user = user;
  if (user) {
    profile.name = user.displayName;
    profile.avatar = user.avatar;
    saveProfile();
  }
}

export async function refreshAccount() {
  if (!getToken()) {
    account.checking = false;
    return;
  }
  try {
    const data = await api('/me');
    applyUser(data.user);
    account.inventory = data.inventory;
    account.history = data.history;
  } catch (err) {
    if (err.status === 401) {
      setToken(null);
      account.user = null;
    }
  } finally {
    account.checking = false;
  }
}

async function signedIn(data) {
  setToken(data.token);
  applyUser(data.user);
  announce();
  await refreshAccount();
  account.modal = 'profile';
}

export async function signUp(username, password) {
  await signedIn(await api('/register', { method: 'POST', body: { username, password, displayName: profile.name, avatar: profile.avatar } }));
}

export async function signIn(username, password) {
  await signedIn(await api('/login', { method: 'POST', body: { username, password } }));
}

export async function signOut() {
  try {
    await api('/logout', { method: 'POST' });
  } catch {
    /* already signed out */
  }
  setToken(null);
  account.user = null;
  account.inventory = {};
  account.history = [];
  account.modal = null;
  announce();
}

export async function deleteMyAccount() {
  await api('/me', { method: 'DELETE' });
  setToken(null);
  account.user = null;
  account.inventory = {};
  account.history = [];
  account.modal = null;
  announce();
}

/** Save name/avatar changes to the account (if signed in). */
export async function saveAccountProfile() {
  if (!account.user) return;
  try {
    const { user } = await api('/me', { method: 'PATCH', body: { displayName: profile.name, avatar: profile.avatar } });
    account.user = user;
  } catch {
    /* keep the local profile; it's saved next time */
  }
}

export async function buyCard(card) {
  const data = await api('/shop/buy', { method: 'POST', body: { card } });
  account.user.stars = data.stars;
  account.inventory = data.inventory;
  socket.emit('power:refresh'); // let the room know about the new card
}

export async function loadLeaderboard() {
  try {
    account.leaderboard = (await api('/leaderboard')).players;
  } catch {
    account.leaderboard = [];
  }
}

export const openAccount = (modal = account.user ? 'profile' : 'signin') => (account.modal = modal);

// ── live updates from the game ──
socket.on('rewards', (rewards) => {
  account.rewards = rewards;
  account.user = rewards.user;
  refreshAccount();
});
socket.on('state', (s) => {
  if (s.phase !== 'gameOver') account.rewards = null;
  // Cards used in-game come back in the room state.
  if (s.cards) account.inventory = { ...s.cards };
});

refreshAccount();
