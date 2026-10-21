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

// Games a room can play. The host picks one in the lobby.
export const GAMES = [
  {
    id: 'pictionary',
    name: 'Pictonary',
    emoji: '🎨',
    desc: 'Draw the word, everyone else guesses it.',
    minPlayers: 2,
  },
  {
    id: 'imposter',
    name: 'Imposter',
    emoji: '🕵️',
    desc: 'Everyone knows the secret word, except the imposter. Give clues, then vote out the faker!',
    minPlayers: 3,
  },
  {
    id: 'cards',
    name: 'Color Clash',
    emoji: '🃏',
    desc: 'Match colors and numbers, hit friends with +2s, and be first to empty your hand!',
    minPlayers: 2,
    maxPlayers: 10,
  },
];

// 🃏 Color Clash cards.
export const CARD_COLORS = ['red', 'yellow', 'green', 'blue'];
export const CARD_HEX = { red: '#e5383b', yellow: '#f6b800', green: '#2ca54a', blue: '#1f7ae0', wild: '#1d1442' };
/** Can `card` be played on `top` (current color `color`, `pending` stacked draws)? */
export function canPlayCard(card, top, color, pending = 0, stacking = false) {
  if (pending > 0) {
    return stacking && ((top.value === 'draw2' && card.value === 'draw2') || (top.value === 'wild4' && card.value === 'wild4'));
  }
  return card.color === 'wild' || card.color === color || card.value === top.value;
}
export const cardPoints = (card) => (/^\d$/.test(card.value) ? Number(card.value) : card.color === 'wild' ? 50 : 20);
export const gameInfo = (id) => GAMES.find((g) => g.id === id) ?? GAMES[0];
/** Teams only apply to Pictonary. */
export const isTeams = (settings) => settings.game !== 'imposter' && settings.mode === 'teams';

export const DEFAULT_SETTINGS = {
  game: 'pictionary', // 'pictionary' | 'imposter'
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
  powerUps: true, // signed-in players may play power-up cards
  // Imposter:
  clueRounds: 2, // how many times around the table everyone gives a clue
  clueTime: 30, // seconds per clue
  voteTime: 45, // seconds to discuss & vote
  imposters: 1, // 1 or 2 (2 needs at least 6 players)
  // Color Clash:
  turnTime: 30, // seconds per turn
  handSize: 7, // cards dealt to each player
  stacking: false, // house rule: answer a +2 with a +2 (or +4 with +4) to pass it on
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
  if (GAMES.some((g) => g.id === input.game)) s.game = input.game;
  if (input.mode === 'solo' || input.mode === 'teams') s.mode = input.mode;
  if ('clueRounds' in input) s.clueRounds = clampInt(input.clueRounds, 1, 3, prev.clueRounds);
  if ('clueTime' in input) s.clueTime = clampInt(input.clueTime, 10, 90, prev.clueTime);
  if ('voteTime' in input) s.voteTime = clampInt(input.voteTime, 20, 120, prev.voteTime);
  if ('imposters' in input) s.imposters = clampInt(input.imposters, 1, 2, prev.imposters);
  if ('turnTime' in input) s.turnTime = clampInt(input.turnTime, 10, 90, prev.turnTime);
  if ('handSize' in input) s.handSize = clampInt(input.handSize, 5, 10, prev.handSize);
  if ('stacking' in input) s.stacking = !!input.stacking;
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
  if ('powerUps' in input) s.powerUps = !!input.powerUps;
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
