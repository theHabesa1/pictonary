// Power-up cards: bought with ⭐ stars (earned slowly by playing), used during games.
// `when` says who can play the card and in which phase:
//   'guessing'  → a player who hasn't guessed yet, while someone else is drawing
//   'drawing'   → the drawer, while drawing
//   'choosing'  → the drawer, while picking a word
export const POWERUPS = {
  category: {
    name: 'Category Clue',
    emoji: '🔍',
    cost: 20,
    when: 'guessing',
    desc: "See which category the word is from — just for you.",
  },
  reroll: {
    name: 'Reroll',
    emoji: '🎲',
    cost: 25,
    when: 'choosing',
    desc: "Don't like your words? Get a fresh set to pick from.",
  },
  peek: {
    name: 'Letter Peek',
    emoji: '💡',
    cost: 30,
    when: 'guessing',
    desc: 'Reveal one extra letter of the word, only on your screen.',
  },
  time: {
    name: 'Extra Time',
    emoji: '⏰',
    cost: 40,
    when: 'drawing',
    desc: '+20 seconds on your drawing turn.',
  },
  splat: {
    name: 'Ink Splat',
    emoji: '💦',
    cost: 45,
    when: 'guessing',
    desc: "Splash ink over your rivals' screens for 4 seconds.",
  },
  double: {
    name: 'Double Points',
    emoji: '✌️',
    cost: 60,
    when: 'guessing',
    desc: 'Your correct guess this turn scores double.',
  },
};

export const POWERUP_IDS = Object.keys(POWERUPS);
export const CARDS_PER_GAME = 3; // each player can play at most this many cards per game
export const EXTRA_TIME_SECONDS = 20;
export const SPLAT_MS = 4000;

// Star economy (kept deliberately slow so cards feel special).
export const STARS = {
  perPoints: 100, // 1 ⭐ per 100 points scored in a game
  winBonus: 5, // 1st place, or on the winning team
  podiumBonus: 2, // 2nd / 3rd place (every-player mode)
  dailyBonus: 5, // first finished game of the day
  dailyCap: 60, // most stars you can earn per day
};

/** Level from lifetime XP (= total points scored): 0 → 1, 250 → 2, 1000 → 3, 2250 → 4 … */
export const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 250)) + 1;
export const xpForLevel = (level) => 250 * (level - 1) ** 2;
