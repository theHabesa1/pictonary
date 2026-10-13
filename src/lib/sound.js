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

function tone(a, { freq, at = 0, dur = 0.15, type = 'sine', vol = 0.12, to }) {
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
