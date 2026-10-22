// Which "How to play" guide is open (null = none). Mounted once in App.svelte.
const SEEN_KEY = 'pictonary.guidesSeen';

export const guide = $state({ open: null });

export const openGuide = (gameId) => (guide.open = gameId);
export const closeGuide = () => (guide.open = null);

function seen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Open a game's guide automatically, but only the first time on this device. */
export function showGuideOnce(gameId) {
  const list = seen();
  if (list.includes(gameId)) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, gameId]));
  } catch {
    /* private mode — show it anyway, just once per visit */
  }
  guide.open = gameId;
}
