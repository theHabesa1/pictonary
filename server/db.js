// Database: real Postgres when DATABASE_URL is set (e.g. a free Neon database in production),
// otherwise an embedded Postgres (PGlite) stored in ./data — zero setup for local play.
// Both speak the same SQL and return { rows }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  avatar          TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  stars           INTEGER NOT NULL DEFAULT 0 CHECK (stars >= 0),
  xp              INTEGER NOT NULL DEFAULT 0,
  games_played    INTEGER NOT NULL DEFAULT 0,
  games_won       INTEGER NOT NULL DEFAULT 0,
  correct_guesses INTEGER NOT NULL DEFAULT 0,
  drawings_guessed INTEGER NOT NULL DEFAULT 0,
  stars_day       TEXT,
  stars_today     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card     TEXT NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (user_id, card)
);
CREATE TABLE IF NOT EXISTS game_results (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL,
  score         INTEGER NOT NULL,
  place         INTEGER NOT NULL,
  players       INTEGER NOT NULL,
  won           BOOLEAN NOT NULL,
  stars_earned  INTEGER NOT NULL,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_results_user ON game_results (user_id, played_at DESC);
`;

let impl = null;

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    // Always verify the database's TLS certificate (Neon and most hosts have valid ones).
    const connectionString = url.replace(/sslmode=(require|prefer|verify-ca)\b/, 'sslmode=verify-full');
    const pool = new pg.Pool({ connectionString, max: 5 });
    impl = { query: (text, params) => pool.query(text, params), exec: (text) => pool.query(text), kind: 'Postgres' };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(root, 'data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const db = await PGlite.create(dir);
    impl = { query: (text, params) => db.query(text, params), exec: (text) => db.exec(text), kind: `embedded Postgres (${path.relative(root, dir)})` };
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
      console.warn('⚠️  No DATABASE_URL set: accounts are stored on local disk and will be lost when the server restarts.');
    }
  }
  await impl.exec(SCHEMA);
  return impl.kind;
}

export function query(text, params = []) {
  if (!impl) throw new Error('Database not initialised');
  return impl.query(text, params);
}
