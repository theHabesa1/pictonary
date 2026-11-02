// "What's new" release notes. Newest first: add an entry at the top whenever players get something
// new. Returning players see the newest one once, on the home screen (WhatsNew.svelte).
const SEEN_KEY = 'pictonary.newsSeen';

export const RELEASES = [
  {
    id: '2026-11-02',
    date: 'November 2026',
    items: [
      {
        emoji: '🌟',
        title: 'Pop Culture words',
        text: 'Famous people, footballers, cartoon characters and places from all over the world: Michael Jackson, Messi, Pikachu, the Eiffel Tower… The surname counts too ("Jackson").',
      },
      {
        emoji: '📚',
        title: 'Lots more words',
        text: 'Over 840 easy words (up from 330) and 3,300+ in all. Words no longer repeat from one game night to the next.',
      },
      {
        emoji: '🔥',
        title: 'Close guesses stay secret',
        text: "If your guess is nearly right, only you see it in the chat, so nobody else can use it.",
      },
      {
        emoji: '🙈',
        title: 'Hide the word',
        text: 'Drawing, or already guessed it? Tap 🙈 Hide so the person sitting next to you can’t peek.',
      },
      {
        emoji: '🤷',
        title: "Don't know the words?",
        text: 'Swap them for new ones while you pick. It costs 40% of your points, and you need 100 points first.',
      },
      {
        emoji: '⚡',
        title: 'Faster and always on',
        text: 'The game moved to a new home. No more waiting a minute for it to wake up.',
      },
    ],
  },
  {
    id: '2026-10-22',
    date: 'October 2026',
    items: [
      { emoji: '🎮', title: 'Two new games', text: '🕵️ Imposter and 🃏 Color Clash, each with a How to play guide.' },
      { emoji: '🎴', title: 'Accounts, stars and power-up cards', text: 'Sign in to level up, earn ⭐ stars and play secret power-up cards.' },
      { emoji: '📶', title: 'Your seat is saved', text: 'Lost connection? Come back to the same spot with your points intact.' },
    ],
  },
];

export const news = $state({ open: false });

export const openNews = () => (news.open = true);
export const closeNews = () => (news.open = false);

function storage(fn) {
  try {
    return fn(localStorage);
  } catch {
    return null; // private mode
  }
}

/** Open the newest notes once, for players who have been here before (not on a first visit). */
export function showNewsOnce() {
  const latest = RELEASES[0].id;
  const seen = storage((s) => s.getItem(SEEN_KEY));
  if (seen === latest) return;
  const returning =
    seen !== null || !!storage((s) => s.getItem('pictonary.profile') || s.getItem('pictonary.token') || s.getItem('pictonary.seats'));
  storage((s) => s.setItem(SEEN_KEY, latest));
  if (returning) news.open = true;
}
