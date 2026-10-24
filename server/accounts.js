// Accounts, stars, stats and power-up card inventory.
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { AVATARS } from '../shared/constants.js';
import { POWERUPS, STARS, levelFor } from '../shared/powerups.js';
import { query } from './db.js';

const scrypt = promisify(crypto.scrypt);
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export class AccountError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
// Checked when the username doesn't exist, so failed logins take the same time either way.
// (The hash of a random password that was thrown away; fixed so startup doesn't pay for it.)
const DUMMY_HASH =
  'scrypt$X85NT3NwAiVXEre938WwsQ==$zL0zdw4nh5huYKx3DCWT0OjFGIIKkkXFEZprpWaXpgpnqwvBduICZxCK884AqSipkxa7B3DJZPHEfVIcVo9MqA==';

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    stars: row.stars,
    xp: row.xp,
    level: levelFor(row.xp),
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    correctGuesses: row.correct_guesses,
    drawingsGuessed: row.drawings_guessed,
    starsToday: row.stars_day === today() ? row.stars_today : 0,
    createdAt: row.created_at,
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [sha256(token), userId]);
  return token;
}

export async function register({ username, password, displayName, avatar } = {}) {
  username = String(username ?? '').trim();
  password = String(password ?? '');
  if (!USERNAME_RE.test(username)) throw new AccountError('Username must be 3–20 letters, numbers or _');
  if (password.length < 6 || password.length > 100) throw new AccountError('Password must be at least 6 characters');
  const hash = await hashPassword(password);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, username_lower, display_name, avatar, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [username, username.toLowerCase(), cleanName(displayName || username), AVATARS.includes(avatar) ? avatar : AVATARS[0], hash],
    );
    return { token: await createSession(rows[0].id), user: publicUser(rows[0]) };
  } catch (err) {
    if (String(err.code) === '23505') throw new AccountError('That username is taken — try another one!', 409);
    throw err;
  }
}

export async function login({ username, password } = {}) {
  const { rows } = await query('SELECT * FROM users WHERE username_lower = $1', [String(username ?? '').trim().toLowerCase()]);
  const ok = await checkPassword(String(password ?? ''), rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) throw new AccountError('Wrong username or password', 401);
  return { token: await createSession(rows[0].id), user: publicUser(rows[0]) };
}

export async function logout(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

/** Permanently delete an account and everything stored for it. */
export async function deleteAccount(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]); // sessions, cards and history cascade
}

export async function userFromToken(token) {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  const { rows } = await query('UPDATE sessions SET last_seen = now() WHERE token_hash = $1 RETURNING user_id', [sha256(token)]);
  return rows[0] ? getUser(rows[0].user_id) : null;
}

export async function getUser(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? publicUser(rows[0]) : null;
}

export async function updateProfile(userId, { displayName, avatar } = {}) {
  const { rows } = await query(
    `UPDATE users SET display_name = COALESCE($2, display_name), avatar = COALESCE($3, avatar)
     WHERE id = $1 RETURNING *`,
    [userId, displayName != null ? cleanName(displayName) : null, AVATARS.includes(avatar) ? avatar : null],
  );
  return publicUser(rows[0]);
}

/** { cardId: qty } */
export async function getInventory(userId) {
  const { rows } = await query('SELECT card, qty FROM inventory WHERE user_id = $1 AND qty > 0', [userId]);
  return Object.fromEntries(rows.filter((r) => POWERUPS[r.card]).map((r) => [r.card, r.qty]));
}

export async function getHistory(userId, limit = 8) {
  const { rows } = await query(
    `SELECT mode, score, place, players, won, stars_earned, played_at FROM game_results
     WHERE user_id = $1 ORDER BY played_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    mode: r.mode,
    score: r.score,
    place: r.place,
    players: r.players,
    won: r.won,
    stars: r.stars_earned,
    playedAt: r.played_at,
  }));
}

export async function leaderboard(limit = 10) {
  const { rows } = await query(
    'SELECT display_name, avatar, xp, games_won FROM users WHERE games_played > 0 ORDER BY xp DESC, id LIMIT $1',
    [limit],
  );
  return rows.map((r) => ({ name: r.display_name, avatar: r.avatar, xp: r.xp, level: levelFor(r.xp), wins: r.games_won }));
}

/** Spend stars on one card — one atomic statement, so stars can't be double-spent. */
export async function buyCard(userId, card) {
  const def = POWERUPS[card];
  if (!def) throw new AccountError('Unknown card');
  const { rows } = await query(
    `WITH paid AS (
       UPDATE users SET stars = stars - $2 WHERE id = $1 AND stars >= $2 RETURNING id, stars
     )
     INSERT INTO inventory (user_id, card, qty) SELECT id, $3, 1 FROM paid
     ON CONFLICT (user_id, card) DO UPDATE SET qty = inventory.qty + 1
     RETURNING qty, (SELECT stars FROM paid) AS stars`,
    [userId, def.cost, card],
  );
  if (!rows[0]) throw new AccountError(`Not enough ⭐ yet — ${def.name} costs ${def.cost}`);
  return { qty: rows[0].qty, stars: rows[0].stars };
}

/** Use up one card. Returns the remaining count, or null if the player has none. */
export async function useCard(userId, card) {
  const { rows } = await query(
    'UPDATE inventory SET qty = qty - 1 WHERE user_id = $1 AND card = $2 AND qty > 0 RETURNING qty',
    [userId, card],
  );
  return rows[0] ? rows[0].qty : null;
}

/** Give a card back (the game moved on before it could take effect). */
export async function refundCard(userId, card) {
  await query(
    `INSERT INTO inventory (user_id, card, qty) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, card) DO UPDATE SET qty = inventory.qty + 1`,
    [userId, card],
  );
}

/**
 * Record a finished game and pay out stars. `result`: { mode, score, place, players, won,
 * correct, drawn }. Returns what was earned so the game-over screen can show it.
 */
export async function recordGame(userId, result) {
  const day = today();
  const { rows } = await query('SELECT xp, stars_day, stars_today FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return null;
  const before = rows[0];
  const earnedToday = before.stars_day === day ? before.stars_today : 0;

  const parts = {
    points: Math.floor(Math.max(0, result.score) / STARS.perPoints),
    win: result.won ? STARS.winBonus : 0,
    podium: !result.won && result.mode === 'solo' && result.players >= 3 && result.place <= 3 ? STARS.podiumBonus : 0,
    daily: earnedToday === 0 && before.stars_day !== day ? STARS.dailyBonus : 0,
  };
  const raw = parts.points + parts.win + parts.podium + parts.daily;
  const stars = Math.max(0, Math.min(raw, STARS.dailyCap - earnedToday));

  const { rows: after } = await query(
    `UPDATE users SET
       stars = stars + $2,
       xp = xp + $3,
       games_played = games_played + 1,
       games_won = games_won + $4,
       correct_guesses = correct_guesses + $5,
       drawings_guessed = drawings_guessed + $6,
       stars_today = (CASE WHEN stars_day = $7 THEN stars_today ELSE 0 END) + $2,
       stars_day = $7
     WHERE id = $1 RETURNING *`,
    [userId, stars, Math.max(0, result.score), result.won ? 1 : 0, result.correct, result.drawn, day],
  );
  await query(
    `INSERT INTO game_results (user_id, mode, score, place, players, won, stars_earned)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, result.mode, result.score, result.place, result.players, result.won, stars],
  );
  const user = publicUser(after[0]);
  return { stars, parts, capped: stars < raw, user, leveledUp: user.level > levelFor(before.xp) };
}
