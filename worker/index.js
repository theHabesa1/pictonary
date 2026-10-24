// Cloudflare Workers entry (config: wrangler.jsonc). Cloudflare serves the built site (dist/)
// itself; this Worker only sees /api, /ws and /health.
//  - /ws and /health go to one Durable Object, GameServer, which holds every room in memory,
//    just like the single Node server does (server/index.js).
//  - /api runs here in the Worker: password hashing is CPU-heavy, and if it ever trips the free
//    plan's CPU limit, only that one request fails — never a game in progress.
import { DurableObject } from 'cloudflare:workers';
import { neon } from '@neondatabase/serverless';
import { AUTH_LIMIT, bearer, handleApi, rateLimiter } from '../server/api.js';
import { hasDb, useDb } from '../server/db.js';
import { Hub } from '../server/hub.js';

/** Accounts live in Neon Postgres, reached over HTTPS (one fetch per query, no open connections). */
function connectDb(env) {
  if (hasDb() || !env.DATABASE_URL) return;
  const sql = neon(env.DATABASE_URL, { fullResults: true });
  useDb({
    query: (text, params) => sql.query(text, params),
    schema: (_text, statements) => sql.transaction(statements.map((s) => sql.query(s))),
  });
}

const json = (status, data) => Response.json(data, { status });
const gameServer = (env) => env.GAME.get(env.GAME.idFromName('main'));

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ws' || pathname === '/health') return gameServer(env).fetch(request);
    if (pathname.startsWith('/api/')) return api(request, env, pathname.slice(4));
    return env.ASSETS.fetch(request);
  },
};

async function api(request, env, path) {
  if (!env.DATABASE_URL) return json(503, { error: 'Accounts are switched off on this server (no database set up).' });
  connectDb(env);
  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const text = await request.text();
    if (text.length > 8192) return json(413, { error: 'That request is too big.' });
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return json(400, { error: 'Bad request' });
    }
  }
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { status, data } = await handleApi(request.method, path, {
    body,
    token: bearer(request.headers.get('authorization')),
    allow: () => gameServer(env).allowAuth(ip),
  });
  return json(status, data);
}

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    connectDb(env);
    this.hub = new Hub();
    this.allow = rateLimiter(AUTH_LIMIT.max, AUTH_LIMIT.windowMs);
    this.clock = null;
    this.armedAt = 0;
  }

  /** Sign-up/sign-in rate limit, kept here so every Worker instance shares it. */
  allowAuth(ip) {
    return this.allow(ip);
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/health') return Response.json(this.hub.stats());
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const socket = this.hub.connect({
      send: (text) => server.send(text),
      close: (code, reason) => server.close(code, reason),
    });
    server.addEventListener('message', (e) => socket.message(typeof e.data === 'string' ? e.data : ''));
    server.addEventListener('close', () => socket.drop());
    server.addEventListener('error', () => socket.drop());
    this.startClock();
    return new Response(null, { status: 101, webSocket: client });
  }

  // The game clock runs while anyone is connected or any room is open. A pending timer keeps
  // the object in memory, but only for 15 minutes per timer, so it's re-armed every 10 minutes:
  // rooms survive even if every player drops off for a moment.
  startClock() {
    if (this.clock) return;
    const arm = () => {
      clearInterval(this.clock);
      this.clock = setInterval(tick, 250);
      this.armedAt = Date.now();
    };
    const tick = () => {
      const now = Date.now();
      this.hub.tick(now);
      if (this.hub.idle()) {
        clearInterval(this.clock);
        this.clock = null;
      } else if (now - this.armedAt > 10 * 60_000) arm();
    };
    arm();
  }
}
