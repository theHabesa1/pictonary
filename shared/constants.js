// Shared between the server and the browser client.

export const CANVAS_W = 1200;
export const CANVAS_H = 900;

export const MAX_PLAYERS = 16;
export const CHOOSE_TIME = 15; // seconds the drawer has to pick a word
export const TURN_END_TIME = 7; // seconds the answer is shown between turns

export const TEAMS = [
  { id: 0, name: 'Red Foxes', emoji: '🦊', color: '#ff5d5d' },
  { id: 1, name: 'Blue Whales', emoji: '🐳', color: '#4d8dff' },
  { id: 2, name: 'Green Frogs', emoji: '🐸', color: '#2fbf63' },
  { id: 3, name: 'Yellow Bees', emoji: '🐝', color: '#f5b400' },
];

export const AVATARS = [
  '🦊', '🐼', '🐸', '🐯', '🦁', '🐨', '🐵', '🐧', '🦄', '🐙', '🐢', '🦖',
  '🐳', '🦉', '🐝', '🐞', '🦋', '🐶', '🐱', '🐰', '🐻', '🐷', '🐮', '🦀',
  '👻', '🤖', '👽', '🎃', '🌵', '🍕', '🧁', '⚽',
];

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '👎'];

export const PALETTE = [
  '#000000', '#4b5563', '#9ca3af', '#ffffff',
  '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#92400e', '#fca5a5', '#fde68a',
  '#86efac', '#93c5fd', '#c4b5fd', '#f9a8d4',
];

export const BRUSH_SIZES = [6, 12, 22, 36, 60];

export const CATEGORY_META = [
  { id: 'animals', label: 'Animals', emoji: '🐾' },
  { id: 'food', label: 'Food', emoji: '🍔' },
  { id: 'objects', label: 'Things', emoji: '🧸' },
  { id: 'actions', label: 'Actions', emoji: '🏃' },
  { id: 'nature', label: 'Places & Nature', emoji: '🏝️' },
  { id: 'sports', label: 'Sports & Games', emoji: '⚽' },
  { id: 'fantasy', label: 'Fantasy & Fun', emoji: '🧙' },
  { id: 'vehicles', label: 'Vehicles & Tech', emoji: '🚀' },
  { id: 'people', label: 'People & Jobs', emoji: '👩‍🚀' },
];

export const DIFFICULTY_MULT = { easy: 1, medium: 1.25, hard: 1.5, custom: 1.25 };

export const DEFAULT_SETTINGS = {
  mode: 'solo', // 'solo' = everyone for themselves, 'teams'
  teamCount: 2,
  rounds: 3,
  drawTime: 80,
  hints: 3, // how many letters get revealed as the clock runs down
  wordChoices: 3,
  difficulty: 'mixed', // easy | medium | hard | mixed
  categories: [], // empty = all categories
  customWords: '',
  customOnly: false,
  allowSteals: true, // teams: other teams may guess and steal the points
};

export const DRAW_TIMES = [30, 45, 60, 80, 100, 120, 150, 180];

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Merge an untrusted partial settings object onto the previous settings. */
export function sanitizeSettings(input, prev = DEFAULT_SETTINGS) {
  const s = { ...prev };
  if (!input || typeof input !== 'object') return s;
  if (input.mode === 'solo' || input.mode === 'teams') s.mode = input.mode;
  if ('teamCount' in input) s.teamCount = clampInt(input.teamCount, 2, TEAMS.length, prev.teamCount);
  if ('rounds' in input) s.rounds = clampInt(input.rounds, 1, 10, prev.rounds);
  if ('drawTime' in input) s.drawTime = clampInt(input.drawTime, 30, 240, prev.drawTime);
  if ('hints' in input) s.hints = clampInt(input.hints, 0, 5, prev.hints);
  if ('wordChoices' in input) s.wordChoices = clampInt(input.wordChoices, 1, 5, prev.wordChoices);
  if (['easy', 'medium', 'hard', 'mixed'].includes(input.difficulty)) s.difficulty = input.difficulty;
  if (Array.isArray(input.categories)) {
    const valid = new Set(CATEGORY_META.map((c) => c.id));
    s.categories = [...new Set(input.categories.filter((c) => valid.has(c)))];
    if (s.categories.length === valid.size) s.categories = [];
  }
  if (typeof input.customWords === 'string') s.customWords = input.customWords.slice(0, 5000);
  if ('customOnly' in input) s.customOnly = !!input.customOnly;
  if ('allowSteals' in input) s.allowSteals = !!input.allowSteals;
  return s;
}

/** Split the custom words textarea into a clean, de-duplicated list. */
export function parseCustomWords(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || '').split(/[,\n]/)) {
    const w = raw.replace(/[_\s]+/g, ' ').trim();
    if (w.length < 2 || w.length > 32) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** True for characters a player has to guess (letters & digits in any script). */
export const isGuessChar = (ch) => /[\p{L}\p{N}]/u.test(ch);
