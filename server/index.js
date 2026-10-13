import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Room } from './room.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 256 * 1024, pingTimeout: 30_000 });

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

  // Wrap handlers so one bad message can never crash the server.
  const on = (event, fn) =>
    socket.on(event, (...args) => {
      try {
        fn(...args);
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

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

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
  console.log(`🎨 Pictonary running at http://localhost:${PORT}${dev ? ' (dev mode)' : ''}`);
});
