// Node's database driver: real Postgres when DATABASE_URL is set (e.g. a free Neon database),
// otherwise an embedded Postgres (PGlite) stored in ./data — zero setup for local play.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSchema, useDb } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Connect, create the tables if needed, and return a description of where accounts live. */
export async function initDb() {
  const url = process.env.DATABASE_URL;
  let kind;
  if (url) {
    const { default: pg } = await import('pg');
    // Always verify the database's TLS certificate (Neon and most hosts have valid ones).
    const connectionString = url.replace(/sslmode=(require|prefer|verify-ca)\b/, 'sslmode=verify-full');
    const pool = new pg.Pool({ connectionString, max: 5 });
    useDb({ query: (text, params) => pool.query(text, params), schema: (sql) => pool.query(sql) });
    kind = 'Postgres';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(root, 'data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const db = await PGlite.create(dir);
    useDb({ query: (text, params) => db.query(text, params), schema: (sql) => db.exec(sql) });
    kind = `embedded Postgres (${path.relative(root, dir)})`;
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
      console.warn('⚠️  No DATABASE_URL set: accounts are stored on local disk and will be lost when the server restarts.');
    }
  }
  await ensureSchema();
  return kind;
}
