// HTTP API for accounts and the power-up shop, independent of the web framework: Node (Express)
// and Cloudflare (Worker) both call handleApi(). Auth: "Authorization: Bearer <token>".
import {
  AccountError, buyCard, deleteAccount, getHistory, getInventory, leaderboard, login, logout, register,
  updateProfile, userFromToken,
} from './accounts.js';

/** Tiny in-memory rate limiter: allow `max` hits per `windowMs` per key (e.g. an IP address). */
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

// Sign-up and sign-in tries per IP (passwords can't be guessed quickly).
export const AUTH_LIMIT = { max: 20, windowMs: 10 * 60_000 };

const ROUTES = {
  'POST /register': { limited: true, run: ({ body }) => register(body) },
  'POST /login': { limited: true, run: ({ body }) => login(body) },
  'POST /logout': { auth: true, run: async ({ token }) => (await logout(token), { ok: true }) },
  'GET /me': {
    auth: true,
    run: async ({ user }) => ({ user, inventory: await getInventory(user.id), history: await getHistory(user.id) }),
  },
  'PATCH /me': { auth: true, run: async ({ user, body }) => ({ user: await updateProfile(user.id, body) }) },
  'DELETE /me': { auth: true, run: async ({ user }) => (await deleteAccount(user.id), { ok: true }) },
  'POST /shop/buy': {
    auth: true,
    run: async ({ user, body }) => {
      const { stars } = await buyCard(user.id, body?.card);
      return { stars, inventory: await getInventory(user.id) };
    },
  },
  'GET /leaderboard': { run: async () => ({ players: await leaderboard() }) },
};

export const bearer = (header) => String(header ?? '').replace(/^Bearer\s+/i, '');

/**
 * Handle one API call. `path` is relative to /api (e.g. "/login"). `allow()` says whether this
 * caller is still under the sign-in rate limit. Returns { status, data } to send back as JSON.
 */
export async function handleApi(method, path, { body = null, token = '', allow = () => true } = {}) {
  const route = ROUTES[`${method} ${path}`];
  if (!route) return { status: 404, data: { error: 'Not found' } };
  try {
    if (route.limited && !(await allow())) {
      return { status: 429, data: { error: 'Too many tries — wait a few minutes and try again.' } };
    }
    let user = null;
    if (route.auth) {
      user = await userFromToken(token).catch((err) => console.error('[auth]', err));
      if (!user) return { status: 401, data: { error: 'Please sign in again.' } };
    }
    return { status: 200, data: await route.run({ body: body ?? {}, token, user }) };
  } catch (err) {
    if (err instanceof AccountError) return { status: err.status, data: { error: err.message } };
    console.error('[api]', err);
    return { status: 500, data: { error: 'Something went wrong on our side. Please try again.' } };
  }
}
