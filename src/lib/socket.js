// A tiny Socket.IO-style client over a plain WebSocket (works on Cloudflare and Node servers).
// Messages are JSON arrays: we send [event, data, ackId?]; the server sends [event, data] or
// ['ack', ackId, data]. Reconnects on its own, and answers the server's pings so a dropped
// connection is noticed within seconds on both ends.

const QUIET_LIMIT = 30_000; // nothing from the server for this long = the connection is dead
const MAX_BUFFER = 200; // messages kept while offline (sent after reconnecting)

/**
 * @param {string} url ws:// or wss:// address of the game server's /ws endpoint
 * @param {{ auth?: () => object, WebSocket?: typeof WebSocket }} [options]
 *   `auth` is called on every (re)connect; its result is sent first, as the 'hello' message.
 */
export function createSocket(url, { auth = () => ({}), WebSocket: WS = globalThis.WebSocket } = {}) {
  const handlers = new Map();
  const acks = new Map();
  let ws = null;
  let nextAck = 1;
  let buffer = [];
  let stopped = false;
  let retries = 0;
  let retryTimer = null;
  let lastHeard = 0;

  const fire = (event, ...args) => {
    for (const fn of handlers.get(event) ?? []) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[socket ${event}]`, err);
      }
    }
  };

  function open() {
    clearTimeout(retryTimer);
    retryTimer = null;
    if (ws || stopped) return;
    const sock = new WS(url);
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      retries = 0;
      lastHeard = Date.now();
      sock.send(JSON.stringify(['hello', auth() ?? {}]));
      api.connected = true;
      fire('connect');
      const queued = buffer;
      buffer = [];
      for (const text of queued) sock.send(text);
    };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      lastHeard = Date.now();
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const [event, data, extra] = msg;
      if (event === 'ping') return sock.send('["pong"]');
      if (event === 'ack') {
        const cb = acks.get(data);
        acks.delete(data);
        return cb?.(extra);
      }
      fire(event, data);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      const was = api.connected;
      api.connected = false;
      acks.clear(); // replies to a closed connection will never come
      if (was) fire('disconnect');
      if (!stopped) retryTimer = setTimeout(open, Math.min(3000, 500 * 1.5 ** retries++) + Math.random() * 300);
    };
    sock.onerror = () => {}; // a close event always follows
  }

  // A connection that silently died (sleeping laptop, lost wifi) never fires "close": spot it.
  const watchdog = setInterval(() => {
    if (api.connected && Date.now() - lastHeard > QUIET_LIMIT) drop();
  }, 5000);

  function drop() {
    const sock = ws;
    if (!sock) return;
    try {
      sock.close();
    } catch {
      /* already closing */
    }
    sock.onclose?.();
  }

  const api = {
    connected: false,

    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return api;
    },

    off(event, fn) {
      handlers.get(event)?.delete(fn);
      return api;
    },

    /** Send an event; `ack(reply)` is called with the server's answer, if it gives one. */
    emit(event, data, ack) {
      const msg = [event, data ?? null];
      if (typeof ack === 'function') {
        const id = nextAck++;
        acks.set(id, ack);
        msg.push(id);
      }
      const text = JSON.stringify(msg);
      if (api.connected && ws?.readyState === 1) ws.send(text);
      else if (buffer.length < MAX_BUFFER) buffer.push(text);
      return api;
    },

    /** Connect now (skips the retry wait), or check a connection that may have died. */
    connect() {
      stopped = false;
      if (api.connected && Date.now() - lastHeard > QUIET_LIMIT) drop();
      if (!ws) open();
      return api;
    },

    /** Close for good (no reconnecting). */
    disconnect() {
      stopped = true;
      clearInterval(watchdog);
      clearTimeout(retryTimer);
      buffer = [];
      drop();
      return api;
    },
  };

  open();
  return api;
}

/** The game server's WebSocket address for a page served from `origin` (http(s)://host). */
export const socketUrl = (origin) => `${origin.replace(/^http/, 'ws')}/ws`;
