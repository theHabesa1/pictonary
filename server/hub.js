// The game server's core: rooms, players' connections and every game message. It doesn't care
// how players connect: server/index.js feeds it WebSockets on Node, worker/index.js feeds it
// WebSockets inside a Cloudflare Durable Object.
//
// Protocol (JSON text frames, see src/lib/socket.js):
//   client → server  [event, data, ackId?]     first message is ['hello', { token }]
//   server → client  [event, data]             replies to an ack: ['ack', ackId, data]
import crypto from 'node:crypto';
import { userFromToken } from './accounts.js';
import { Room, uid } from './room.js';
import { sanitizeSettings } from '../shared/constants.js';

const PING_EVERY = 10_000; // ping a quiet connection this often…
const DEAD_AFTER = 25_000; // …and give up on it after this long without a word back
export const MAX_MESSAGE = 256 * 1024;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** One player's connection, with the parts of Socket.IO's socket API the game uses. */
class Socket {
  constructor(hub, conn) {
    this.hub = hub;
    this.conn = conn; // { send(text), close(code, reason) }
    this.id = uid();
    this.data = {}; // user, code (room), pid (player id)
    this.groups = new Set();
    this.handlers = new Map();
    this.queue = Promise.resolve(); // messages are handled in order, after 'hello' resolves
    this.closed = false;
    this.lastHeard = this.lastSent = Date.now();
    this.lastPing = 0;
  }

  on(event, fn) {
    this.handlers.set(event, fn);
  }

  emit(event, data) {
    this.send(JSON.stringify([event, data ?? null]));
  }

  send(text) {
    if (this.closed) return;
    try {
      this.conn.send(text);
      this.lastSent = Date.now();
    } catch {
      this.drop();
    }
  }

  join(code) {
    this.groups.add(code);
    if (!this.hub.groups.has(code)) this.hub.groups.set(code, new Set());
    this.hub.groups.get(code).add(this);
  }

  leave(code) {
    this.groups.delete(code);
    const members = this.hub.groups.get(code);
    members?.delete(this);
    if (members?.size === 0) this.hub.groups.delete(code);
  }

  /** Everyone in room `code` except this socket. */
  to(code) {
    return this.hub.to(code, this);
  }

  /** A text frame arrived from the player. */
  message(text) {
    this.lastHeard = Date.now();
    if (typeof text !== 'string' || text.length > MAX_MESSAGE) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!Array.isArray(msg) || typeof msg[0] !== 'string' || msg[0] === 'pong') return;
    const [event, data, ackId] = msg;
    this.queue = this.queue.then(() => this.handle(event, data, ackId));
  }

  async handle(event, data, ackId) {
    if (this.closed) return;
    if (event === 'hello') {
      try {
        this.data.user = await userFromToken(data?.token);
      } catch (err) {
        console.error('[socket auth]', err);
        this.data.user = null;
      }
      return;
    }
    const fn = this.handlers.get(event);
    if (!fn) return;
    const ack = ackId == null ? undefined : (reply) => this.send(JSON.stringify(['ack', ackId, reply ?? null]));
    fn(data ?? undefined, ack); // undefined, so handlers' default parameters apply
  }

  /** The connection is gone (closed by the player, or dead). Safe to call more than once. */
  drop() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.conn.close(1000, 'bye');
    } catch {
      /* already closed */
    }
    for (const code of [...this.groups]) this.leave(code);
    this.hub.sockets.delete(this.id);
    this.handlers.get('disconnect')?.();
  }
}

export class Hub {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, Socket>} */
    this.sockets = new Map();
    /** @type {Map<string, Set<Socket>>} room code -> sockets in it */
    this.groups = new Map();
    this.startedAt = new Date();
    // What Room expects from Socket.IO's server object.
    this.io = { sockets: { sockets: this.sockets }, to: (target) => this.to(target) };
  }

  /** Emit to one socket (by id) or to every socket in a room (by code), optionally minus one. */
  to(target, except = null) {
    return {
      emit: (event, data) => {
        const one = this.sockets.get(target);
        const members = one ? [one] : this.groups.get(target);
        if (!members) return;
        const text = JSON.stringify([event, data ?? null]);
        for (const s of members) if (s !== except) s.send(text);
      },
    };
  }

  /** A player connected. Feed their messages to `.message(text)` and call `.drop()` when it closes. */
  connect(conn) {
    const socket = new Socket(this, conn);
    this.sockets.set(socket.id, socket);
    this.setup(socket);
    return socket;
  }

  /** Nothing to look after: no rooms and nobody connected. */
  idle() {
    return this.rooms.size === 0 && this.sockets.size === 0;
  }

  stats() {
    return {
      ok: true,
      rooms: this.rooms.size,
      players: this.sockets.size,
      upSince: this.startedAt.toISOString(),
      uptimeMin: Math.round((Date.now() - this.startedAt) / 60_000),
    };
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Game clock (every 250ms): hints, timers, turn changes, cleanup and connection checks. */
  tick(now = Date.now()) {
    for (const [code, r] of this.rooms) {
      try {
        if (!r.tick(now)) this.rooms.delete(code);
      } catch (err) {
        console.error(`[tick ${code}]`, err);
      }
    }
    for (const s of this.sockets.values()) {
      if (now - s.lastHeard > DEAD_AFTER) s.drop();
      else if (now - s.lastPing >= PING_EVERY && (now - s.lastHeard >= PING_EVERY || now - s.lastSent >= PING_EVERY)) {
        s.lastPing = now;
        s.send('["ping"]');
      }
    }
  }

  setup(socket) {
    const rooms = this.rooms;
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

    on('room:create', (data, ack) => {
      data ??= {};
      leaveCurrent();
      const r = new Room(this.io, this.newCode());
      // The game picked on the home page.
      r.settings = sanitizeSettings({ game: data.game }, r.settings);
      rooms.set(r.code, r);
      reply(ack, r.join(socket, data));
    });

    on('room:join', (data, ack) => {
      data ??= {};
      const code = String(data.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const r = rooms.get(code);
      if (!r) return reply(ack, { error: `Room "${code}" doesn't exist (or it ended). Check the code!` });
      if (socket.data.code && socket.data.code !== code) leaveCurrent();
      reply(ack, r.join(socket, data));
    });

    on('room:leave', leaveCurrent);

    on('settings:update', (patch) => room()?.updateSettings(pid(), patch ?? {}));
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
  }
}
