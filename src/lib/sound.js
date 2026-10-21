// Tiny synthesized sound effects — no audio files needed.
let ac = null;
let muted = false;

export const setMuted = (m) => (muted = m);

function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', () => audio(), { once: true });
window.addEventListener('keydown', () => audio(), { once: true });

let noiseBuf = null;
/** A burst of filtered noise — sounds like a card snapping or sliding. */
function noise(a, { at = 0, dur = 0.08, freq = 2400, q = 0.9, vol = 0.25 }) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + dur + 0.02);
}

function tone(a, t) {
  if (t.noise) return noise(a, t);
  const { freq, at = 0, dur = 0.15, type = 'sine', vol = 0.12, to } = t;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  correct: [
    { freq: 784, dur: 0.12, type: 'triangle' },
    { freq: 988, at: 0.09, dur: 0.12, type: 'triangle' },
    { freq: 1319, at: 0.18, dur: 0.3, type: 'triangle' },
  ],
  close: [{ freq: 440, dur: 0.12, type: 'square', vol: 0.05 }, { freq: 494, at: 0.1, dur: 0.14, type: 'square', vol: 0.05 }],
  tick: [{ freq: 1100, dur: 0.05, type: 'square', vol: 0.04 }],
  hint: [{ freq: 600, dur: 0.18, type: 'sine', to: 900, vol: 0.1 }],
  pop: [{ freq: 300, dur: 0.12, type: 'sine', to: 700, vol: 0.12 }],
  leave: [{ freq: 500, dur: 0.15, type: 'sine', to: 250, vol: 0.08 }],
  start: [
    { freq: 523, dur: 0.1, type: 'triangle' },
    { freq: 659, at: 0.08, dur: 0.1, type: 'triangle' },
    { freq: 784, at: 0.16, dur: 0.2, type: 'triangle' },
  ],
  yourTurn: [
    { freq: 659, dur: 0.1, type: 'square', vol: 0.06 },
    { freq: 880, at: 0.1, dur: 0.1, type: 'square', vol: 0.06 },
    { freq: 1047, at: 0.2, dur: 0.25, type: 'square', vol: 0.06 },
  ],
  reveal: [{ freq: 880, dur: 0.25, type: 'sine', to: 440, vol: 0.1 }],
  // 🃏 cards
  card: [
    { noise: true, dur: 0.05, freq: 3200, vol: 0.35 },
    { noise: true, at: 0.03, dur: 0.09, freq: 1400, q: 0.6, vol: 0.18 },
  ],
  draw: [{ noise: true, dur: 0.12, freq: 1800, q: 0.5, vol: 0.16 }],
  deal: [{ noise: true, dur: 0.04, freq: 2800, vol: 0.18 }],
  shuffle: Array.from({ length: 10 }, (_, i) => ({ noise: true, at: i * 0.045, dur: 0.04, freq: 2200 + (i % 3) * 600, vol: 0.14 })),
  lastCard: [
    { freq: 880, dur: 0.12, type: 'square', vol: 0.06 },
    { freq: 1175, at: 0.12, dur: 0.25, type: 'square', vol: 0.06 },
  ],
  whoosh: [{ noise: true, dur: 0.35, freq: 700, q: 0.4, vol: 0.12 }],
  splat: [
    { freq: 220, dur: 0.25, type: 'sawtooth', to: 60, vol: 0.12 },
    { freq: 900, at: 0.02, dur: 0.12, type: 'square', to: 200, vol: 0.05 },
  ],
  power: [
    { freq: 523, dur: 0.08, type: 'triangle' },
    { freq: 784, at: 0.07, dur: 0.08, type: 'triangle' },
    { freq: 1175, at: 0.14, dur: 0.22, type: 'sine', vol: 0.1 },
  ],
  coins: [
    { freq: 988, dur: 0.08, type: 'square', vol: 0.05 },
    { freq: 1319, at: 0.08, dur: 0.25, type: 'square', vol: 0.05 },
    { freq: 1568, at: 0.3, dur: 0.08, type: 'square', vol: 0.05 },
    { freq: 2093, at: 0.38, dur: 0.3, type: 'square', vol: 0.05 },
  ],
  fanfare: [
    { freq: 523, dur: 0.15, type: 'triangle' },
    { freq: 659, at: 0.15, dur: 0.15, type: 'triangle' },
    { freq: 784, at: 0.3, dur: 0.15, type: 'triangle' },
    { freq: 1047, at: 0.45, dur: 0.5, type: 'triangle', vol: 0.15 },
    { freq: 784, at: 0.45, dur: 0.5, type: 'sine', vol: 0.08 },
  ],
};

export function sfx(name) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  for (const t of SOUNDS[name] ?? []) tone(a, t);
}
