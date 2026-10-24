// Owns the drawing ops for the current turn and keeps the canvas in sync with the server.
import { socket } from './game.svelte.js';
import { clearCanvas, drawStroke, floodFill, replay } from './paint.js';

let ctx = null;
let ops = [];
let turnId = null;

let current = null; // stroke being drawn locally
let pending = []; // points not yet sent
let flushTimer = null;

export function attach(canvas) {
  ctx = canvas.getContext('2d');
  replay(ctx, ops);
}

export function detach() {
  ctx = null;
}

/** Call whenever the server's turn id changes: a new turn starts with a blank canvas. */
export function setTurn(id) {
  if (id === turnId) return;
  turnId = id;
  ops = [];
  current = null;
  pending = [];
  if (ctx) clearCanvas(ctx);
}

export const hasOps = () => ops.length > 0;

// ───────────────────────── local drawing (drawer) ─────────────────────────

export function beginStroke(x, y, color, size) {
  const op = { type: 'stroke', id: Math.random().toString(36).slice(2, 10), color, size, points: [x, y] };
  ops.push(op);
  current = op;
  if (ctx) drawStroke(ctx, op, 0);
  socket.emit('draw:op', { ...op, points: [x, y] });
}

export function extendStroke(x, y) {
  if (!current) return;
  const from = current.points.length / 2;
  current.points.push(x, y);
  pending.push(x, y);
  if (ctx) drawStroke(ctx, current, from);
  // Points go out in batches, 20 a second: smooth to watch, light on the server's message budget.
  flushTimer ??= setTimeout(flush, 50);
}

export function endStroke() {
  flush();
  current = null;
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (current && pending.length) socket.emit('draw:pts', { id: current.id, points: pending });
  pending = [];
}

export function fill(x, y, color) {
  const op = { type: 'fill', x: Math.round(x), y: Math.round(y), color };
  ops.push(op);
  if (ctx) floodFill(ctx, op.x, op.y, op.color);
  socket.emit('draw:fill', op);
}

export function undo() {
  if (current || !ops.length) return;
  ops.pop();
  if (ctx) replay(ctx, ops);
  socket.emit('draw:undo');
}

export function clear() {
  if (current || !ops.length || ops[ops.length - 1].type === 'clear') return;
  ops.push({ type: 'clear' });
  if (ctx) clearCanvas(ctx);
  socket.emit('draw:clear');
}

// ───────────────────────── remote drawing (everyone else) ─────────────────────────

socket.on('draw:sync', (data) => {
  turnId = data.turnId;
  ops = data.ops.map((op) => (op.type === 'stroke' ? { ...op, points: [...op.points] } : op));
  current = null;
  if (ctx) replay(ctx, ops);
});

socket.on('draw:op', (op) => {
  ops.push(op);
  if (ctx) drawStroke(ctx, op, 0);
});

socket.on('draw:pts', ({ id, points }) => {
  for (let i = ops.length - 1; i >= 0 && i >= ops.length - 5; i--) {
    const op = ops[i];
    if (op.id !== id) continue;
    const from = op.points.length / 2;
    op.points.push(...points);
    if (ctx) drawStroke(ctx, op, from);
    return;
  }
});

socket.on('draw:fill', (op) => {
  ops.push(op);
  if (ctx) floodFill(ctx, op.x, op.y, op.color);
});

socket.on('draw:undo', () => {
  ops.pop();
  if (ctx) replay(ctx, ops);
});

socket.on('draw:clear', () => {
  ops.push({ type: 'clear' });
  if (ctx) clearCanvas(ctx);
});
