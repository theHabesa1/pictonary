import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { userFromToken } from './accounts.js';
import { apiRouter } from './api.js';
import { initDb } from './db.js';
import { Room } from './room.js';

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
app.set('trust proxy', 1); // behind Render's proxy: req.ip is the player's IP
const server = http.createServer(app);
// Fairly quick pings so a dropped player shows as "away" within ~20s.
const io = new Server(server, { maxHttpBufferSize: 256 * 1024, pingInterval: 10_000, pingTimeout: 12_000 });

// Signed-in players send their login token when connecting; guests send none.
io.use(async (socket, next) => {
  try {
    socket.data.user = await userFromToken(socket.handshake.auth?.token);
  } catch (err) {
    console.error('[socket auth]', err);
    socket.data.user = null;
  }
  next();
});

/** @type {Map<string, Room>} */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
}

io.on('connection', (socket) => {
  const room = () => rooms.get(socket.data.code);
  const pid = () => socket.data.pid;

  // Wrap handlers so one bad message can never crash the server (sync or async).
  const on = (event, fn) =>
    socket.on(event, (...args) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) result.catch((err) => console.error(`[${event}]`, err));
      } catch (err) {
        console.error(`[${event}]`, err);
      }
    });
  const reply = (ack, data) => typeof ack === 'function' && ack(data);

  function leaveCurrent() {
    const r = room();
    if (!r) return;
    const p = r.players.get(pid());
    socket.leave(r.code);
    socket.data.code = null;
    r.remove(pid(), p ? `${p.name} left the room` : null);
  }

  on('room:create', (data = {}, ack) => {
    leaveCurrent();
    const r = new Room(io, newCode());
    rooms.set(r.code, r);
    reply(ack, r.join(socket, data));
  });

  on('room:join', (data = {}, ack) => {
    const code = String(data.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = rooms.get(code);
    if (!r) return reply(ack, { error: `Room "${code}" doesn't exist (or it ended). Check the code!` });
    if (socket.data.code && socket.data.code !== code) leaveCurrent();
    reply(ack, r.join(socket, data));
  });

  on('room:leave', leaveCurrent);

  on('settings:update', (patch) => room()?.updateSettings(pid(), patch));
  on('team:set', ({ team, playerId } = {}) => room()?.setTeam(pid(), team, playerId));
  on('team:shuffle', () => room()?.shuffleTeams(pid()));
  on('player:kick', (targetId) => room()?.kick(pid(), targetId));
  on('game:start', () => room()?.start(pid()));
  on('game:lobby', () => room()?.backToLobby(pid()));
  on('turn:skip', () => room()?.skip(pid()));
  on('word:choose', (index) => room()?.chooseWord(pid(), index));
  on('chat', (text) => room()?.chat(pid(), text));
  on('react', (emoji) => room()?.react(pid(), emoji));
  // Signed in or out without reconnecting: update who this socket belongs to.
  on('auth', async (token, ack) => {
    socket.data.user = token ? await userFromToken(token) : null;
    room()?.linkAccount(pid(), socket.data.user);
    reply(ack, { ok: !!socket.data.user });
  });
  on('power:use', (card) => room()?.usePower(pid(), card));
  on('imp:clue', (text) => room()?.engine?.submitClue?.(pid(), text));
  on('imp:vote', (targetId) => room()?.engine?.vote?.(pid(), targetId));
  on('imp:guess', (text) => room()?.engine?.imposterGuess?.(pid(), text));
  on('cards:play', ({ id, color } = {}) => room()?.engine?.play?.(pid(), id, color));
  on('cards:draw', () => room()?.engine?.draw?.(pid()));
  on('cards:pass', () => room()?.engine?.pass?.(pid()));
  on('cards:last', () => room()?.engine?.callLastCard?.(pid()));
  on('cards:catch', (targetId) => room()?.engine?.catchPlayer?.(pid(), targetId));
  on('power:refresh', () => room()?.refreshCards(pid()));

  on('draw:op', (op) => room()?.drawOp(socket, pid(), op));
  on('draw:pts', (data) => room()?.drawPoints(socket, pid(), data));
  on('draw:fill', (data) => room()?.drawFill(socket, pid(), data));
  on('draw:undo', () => room()?.drawUndo(socket, pid()));
  on('draw:clear', () => room()?.drawClear(socket, pid()));
  on('draw:sync', () => {
    const r = room();
    if (r) socket.emit('draw:sync', { turnId: r.turn?.id ?? null, ops: r.ops });
  });

  on('disconnect', () => {
    const r = room();
    if (r && r.players.get(pid())?.socketId === socket.id) r.disconnect(pid());
  });
});

// Game clock: hints, timers, turn changes and cleanup.
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    try {
      if (!r.tick(now)) rooms.delete(code);
    } catch (err) {
      console.error(`[tick ${code}]`, err);
    }
  }
}, 250);

const startedAt = new Date();
app.get('/health', (_req, res) =>
  res.json({ ok: true, rooms: rooms.size, upSince: startedAt.toISOString(), uptimeMin: Math.round(process.uptime() / 60) }),
);
app.use('/api', apiRouter());

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
