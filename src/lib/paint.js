// Pure canvas rendering of drawing operations. Every client replays the same ops,
// so everybody sees the same picture.
import { CANVAS_H, CANVAS_W } from '../../shared/constants.js';

export function clearCanvas(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

/**
 * Draw the part of a stroke that starts at point index `from`.
 * Uses quadratic curves through midpoints for smooth lines, plus a straight
 * "tail" to the newest point so the line never lags behind the pen.
 */
export function drawStroke(ctx, op, from = 0) {
  const p = op.points;
  const n = p.length / 2;
  if (!n) return;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (from === 0) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], op.size / 2, 0, Math.PI * 2);
    ctx.fill();
    if (n === 1) return;
    from = 1;
  }

  const mx = (i) => (p[i * 2] + p[i * 2 + 2]) / 2;
  const my = (i) => (p[i * 2 + 1] + p[i * 2 + 3]) / 2;

  ctx.beginPath();
  for (let i = Math.max(2, from); i < n; i++) {
    const k = i - 1; // segment through control point k, ending at midpoint k
    if (k === 1) ctx.moveTo(p[0], p[1]);
    else ctx.moveTo(mx(k - 1), my(k - 1));
    ctx.quadraticCurveTo(p[k * 2], p[k * 2 + 1], mx(k), my(k));
  }
  // Tail to the newest point.
  if (n >= 3) ctx.moveTo(mx(n - 2), my(n - 2));
  else ctx.moveTo(p[0], p[1]);
  ctx.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
  ctx.stroke();
}

const hexToRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Scanline flood fill with a little tolerance and a 1px bleed to hide anti-aliasing. */
export function floodFill(ctx, sx, sy, hex) {
  const w = CANVAS_W;
  const h = CANVAS_H;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [fr, fg, fb] = hexToRgb(hex);
  const start = (sy * w + sx) * 4;
  const tr = d[start];
  const tg = d[start + 1];
  const tb = d[start + 2];
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 6) return;

  const TOL = 110;
  const mask = new Uint8Array(w * h);
  const match = (px) => {
    const i = px * 4;
    return Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= TOL;
  };

  const stack = [sy * w + sx];
  while (stack.length) {
    let px = stack.pop();
    if (mask[px]) continue;
    const y = Math.floor(px / w);
    let x = px - y * w;
    while (x > 0 && !mask[px - 1] && match(px - 1)) {
      x--;
      px--;
    }
    let up = false;
    let down = false;
    while (x < w && !mask[px] && match(px)) {
      mask[px] = 1;
      if (y > 0) {
        const q = px - w;
        if (!mask[q] && match(q)) {
          if (!up) stack.push(q);
          up = true;
        } else up = false;
      }
      if (y < h - 1) {
        const q = px + w;
        if (!mask[q] && match(q)) {
          if (!down) stack.push(q);
          down = true;
        } else down = false;
      }
      x++;
      px++;
    }
  }

  const paint = (px) => {
    const i = px * 4;
    d[i] = fr;
    d[i + 1] = fg;
    d[i + 2] = fb;
    d[i + 3] = 255;
  };
  for (let px = 0; px < w * h; px++) {
    if (!mask[px]) continue;
    paint(px);
    const x = px % w;
    if (x > 0 && !mask[px - 1]) paint(px - 1);
    if (x < w - 1 && !mask[px + 1]) paint(px + 1);
    if (px >= w && !mask[px - w]) paint(px - w);
    if (px < w * (h - 1) && !mask[px + w]) paint(px + w);
  }
  ctx.putImageData(img, 0, 0);
}

export function renderOp(ctx, op) {
  if (op.type === 'stroke') drawStroke(ctx, op, 0);
  else if (op.type === 'fill') floodFill(ctx, op.x, op.y, op.color);
  else if (op.type === 'clear') clearCanvas(ctx);
}

export function replay(ctx, ops) {
  let start = 0;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'clear') {
      start = i + 1;
      break;
    }
  }
  clearCanvas(ctx);
  for (let i = start; i < ops.length; i++) renderOp(ctx, ops[i]);
}
