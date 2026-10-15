// HTTP API for accounts and the power-up shop. Auth: "Authorization: Bearer <token>".
import express from 'express';
import {
  AccountError, buyCard, deleteAccount, getHistory, getInventory, leaderboard, login, logout, register,
  updateProfile, userFromToken,
} from './accounts.js';

/** Tiny in-memory rate limiter: `max` requests per `windowMs` per IP. */
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const list = (hits.get(req.ip) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many tries — wait a few minutes and try again.' });
    list.push(now);
    hits.set(req.ip, list);
    if (hits.size > 5000) hits.clear();
    next();
  };
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message });
    console.error('[api]', err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  }
};

async function requireUser(req, res, next) {
  try {
    req.token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    req.user = await userFromToken(req.token);
  } catch (err) {
    console.error('[auth]', err);
  }
  if (!req.user) return res.status(401).json({ error: 'Please sign in again.' });
  next();
}

export function apiRouter() {
  const r = express.Router();
  r.use(express.json({ limit: '8kb' }));
  const authLimit = rateLimit(20, 10 * 60_000);

  r.post('/register', authLimit, handle((req) => register(req.body)));
  r.post('/login', authLimit, handle((req) => login(req.body)));
  r.post('/logout', requireUser, handle(async (req) => (await logout(req.token), { ok: true })));

  r.get(
    '/me',
    requireUser,
    handle(async (req) => ({
      user: req.user,
      inventory: await getInventory(req.user.id),
      history: await getHistory(req.user.id),
    })),
  );
  r.patch('/me', requireUser, handle(async (req) => ({ user: await updateProfile(req.user.id, req.body) })));
  r.delete('/me', requireUser, handle(async (req) => (await deleteAccount(req.user.id), { ok: true })));

  r.post(
    '/shop/buy',
    requireUser,
    handle(async (req) => {
      const { stars } = await buyCard(req.user.id, req.body?.card);
      return { stars, inventory: await getInventory(req.user.id) };
    }),
  );

  r.get('/leaderboard', handle(async () => ({ players: await leaderboard() })));
  return r;
}
