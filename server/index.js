// Node server: serves the site, the accounts API and the game's WebSockets (/ws).
// The same game runs on Cloudflare Workers too — see worker/index.js.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { AUTH_LIMIT, bearer, handleApi, rateLimiter } from './api.js';
import { initDb } from './db-node.js';
import { Hub, MAX_MESSAGE } from './hub.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Local secrets (e.g. DATABASE_URL) live in a git-ignored .env file; hosts set them directly.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env file — that's fine */
}
const dev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;

const dbKind = await initDb();

const app = express();
app.set('trust proxy', 1); // behind a host's proxy: req.ip is the player's IP
const server = http.createServer(app);
const hub = new Hub();

// Game connections. noServer, so Vite's own WebSocket (live reload in dev) keeps working.
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
server.on('upgrade', (req, sock, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') {
    if (!dev) sock.destroy();
    return;
  }
  wss.handleUpgrade(req, sock, head, (ws) => {
    const socket = hub.connect({ send: (text) => ws.send(text), close: (code, reason) => ws.close(code, reason) });
    ws.on('message', (data, isBinary) => !isBinary && socket.message(data.toString()));
    ws.on('close', () => socket.drop());
    ws.on('error', () => socket.drop());
  });
});

setInterval(() => hub.tick(), 250);

app.get('/health', (_req, res) => res.json(hub.stats()));

const allowAuth = rateLimiter(AUTH_LIMIT.max, AUTH_LIMIT.windowMs);
app.use('/api', express.json({ limit: '8kb' }), async (req, res) => {
  const { status, data } = await handleApi(req.method, req.path, {
    body: req.body,
    token: bearer(req.get('authorization')),
    allow: () => allowAuth(req.ip),
  });
  res.status(status).json(data);
});

// Render's free plan puts the server to sleep after 15 minutes without visitors. Visiting our
// own public URL every 10 minutes keeps it awake (Render sets RENDER_EXTERNAL_URL for us).
// Set KEEP_AWAKE=false to turn this off, or PUBLIC_URL to use it on another host.
const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
if (publicUrl && process.env.KEEP_AWAKE !== 'false') {
  setInterval(() => fetch(`${publicUrl}/health`).catch(() => {}), 10 * 60_000);
  console.log(`⏰ Keep-awake: visiting ${publicUrl}/health every 10 minutes`);
}

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, 'dist');
  app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '30d', immutable: true }));
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => {
  console.log(`🎨 Pictonary running at http://localhost:${PORT}${dev ? ' (dev mode)' : ''} · accounts in ${dbKind}`);
});
