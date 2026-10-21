// Flying-card animations for Color Clash.
// A card is mounted at its destination, then animated *from* where it started (FLIP style):
// it arcs through the air, scales, spins a little and flips in 3D (face ↔ back).
import { mount, unmount } from 'svelte';
import FlipCard from '../components/cards/FlipCard.svelte';

let layer = null;
export const setLayer = (el) => (layer = el);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object} o
 * @param {object|null} o.card   card to show (null = face-down / unknown)
 * @param {DOMRect} o.from       where it starts
 * @param {DOMRect} o.to         where it lands
 * @param {'up'|'down'|'none'} [o.flip]  'up' = starts face-down and turns face-up; 'down' = stays face-down
 * @param {number} [o.delay] [o.duration] [o.toRotate] [o.fromRotate]
 * @param {() => void} [o.onStart] [o.onLand]
 */
export function flyCard({ card, from, to, flip = 'none', delay = 0, duration = 520, toRotate = 0, fromRotate = 0, onStart, onLand }) {
  if (!layer || !from || !to || !to.width) {
    setTimeout(() => {
      onStart?.();
      onLand?.();
    }, delay);
    return;
  }
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    pointerEvents: 'none',
    zIndex: '70',
    transformStyle: 'preserve-3d',
    visibility: 'hidden',
  });
  layer.appendChild(el);
  const comp = mount(FlipCard, { target: el, props: { card: flip === 'down' ? null : card, w: to.width } });

  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = from.width / to.width;
  const y0 = flip === 'up' || flip === 'down' ? 180 : 0; // 180° = showing the back
  const y1 = flip === 'down' ? 180 : 0;
  const lift = Math.min(80, 20 + Math.hypot(dx, dy) * 0.12); // higher arc for longer throws
  const P = 'perspective(1100px)';

  const time = reduceMotion() ? 1 : duration;
  const anim = el.animate(
    [
      { transform: `${P} translate(${dx}px, ${dy}px) scale(${s}) rotate(${fromRotate}deg) rotateY(${y0}deg)` },
      {
        transform: `${P} translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${((s + 1) / 2) * 1.12}) rotate(${(fromRotate + toRotate) / 2 + (dx > 0 ? -8 : 8)}deg) rotateY(${(y0 + y1) / 2}deg)`,
        offset: 0.5,
      },
      { transform: `${P} translate(0, 0) scale(1) rotate(${toRotate}deg) rotateY(${y1}deg)` },
    ],
    { duration: time, delay, easing: 'cubic-bezier(.3,.7,.25,1)', fill: 'both' },
  );
  setTimeout(() => {
    el.style.visibility = 'visible';
    onStart?.();
  }, delay);
  const done = () => {
    unmount(comp);
    el.remove();
    onLand?.();
  };
  anim.finished.then(done, done);
}

/** Bounding rect of the first element matching `selector` (or null). */
export const rectOf = (selector, root = document) => root.querySelector(selector)?.getBoundingClientRect() ?? null;

/** Stable small rotation for a card on the pile, so the pile looks hand-tossed. */
export function pileTilt(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 28) - 14; // -14° … +13°
}
export function pileOffset(id) {
  let h = 7;
  for (const ch of String(id)) h = (h * 17 + ch.charCodeAt(0)) | 0;
  return [(Math.abs(h) % 14) - 7, (Math.abs(h >> 4) % 10) - 5];
}
