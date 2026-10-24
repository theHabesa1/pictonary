// Database access for accounts. Each host plugs in its own driver with useDb(): Node uses
// Postgres (pg) or an embedded PGlite (server/db-node.js), Cloudflare uses Neon's HTTP driver
// (worker/index.js). They all speak the same SQL and return { rows }.

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

/** The schema as separate statements, for drivers that run one statement at a time. */
export const SCHEMA_STATEMENTS = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean);

let impl = null;
let ready = null;

/**
 * Plug in a database driver: { query(text, params) → Promise<{ rows }>, schema() → Promise }.
 * `schema()` creates the tables if they're missing; it runs before the first query.
 */
export function useDb(driver) {
  impl = driver;
  ready = null;
}

export const hasDb = () => impl !== null;

export function ensureSchema() {
  if (!impl) throw new Error('Database not initialised');
  ready ??= impl.schema(SCHEMA, SCHEMA_STATEMENTS).catch((err) => {
    ready = null; // try again on the next query
    throw err;
  });
  return ready;
}

export async function query(text, params = []) {
  await ensureSchema();
  return impl.query(text, params);
}
