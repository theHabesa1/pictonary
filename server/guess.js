// Guess checking, shared by Pictionary and Imposter. Accents, case and punctuation never
// matter ("Pelé" = "pele", "Spider-Man" = "spiderman"), and a word's aliases count too
// ("Michael Jackson" also accepts "Jackson").

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const answers = (word, alts = []) => [word, ...alts].map(normalize).filter(Boolean);
const squash = (s) => s.replace(/ /g, '');

/** Is `guess` the word (or one of its aliases)? Also true when the guess contains it ("a big cat"). */
export function isCorrect(guess, word, alts) {
  const g = normalize(guess);
  if (!g) return false;
  return answers(word, alts).some((w) => g === w || squash(g) === squash(w) || ` ${g} `.includes(` ${w} `));
}

// Little words that give nothing away on their own ("the" in "Winnie the Pooh").
const FILLER = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'on', 'to', 'with', 'mr', 'mrs', 'dr', 'de', 'da', 'van', 'del']);

/** How alike two strings are, from 0 to 1: the share of letters that line up (1 = identical). */
export function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// A guess this alike (60% of the letters match) gives too much away to show everyone.
const CLOSE = 0.6;

/**
 * Is `guess` nearly right? Typos ("manky" for "monkey"), most of the word ("strawb" for
 * "strawberry"), or one real part of a longer answer ("jakson" for "Michael Jackson"), also
 * inside a longer message. Close guesses are only shown to the player who typed them.
 */
export function isClose(guess, word, alts) {
  const g = normalize(guess);
  if (squash(g).length < 3) return false;
  const tokens = g.split(' ').filter((t) => t.length >= 3 && !FILLER.has(t));
  return answers(word, alts).some((w) => {
    if (similarity(squash(g), squash(w)) >= CLOSE) return true;
    const parts = w.split(' ').filter((part) => part.length >= 3 && !FILLER.has(part));
    return parts.some((part) => tokens.some((t) => similarity(t, part) >= CLOSE));
  });
}
