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
  if (Math.abs(a.length - b.length) > 2) return 3;
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

/**
 * Is `guess` nearly right? A typo or two ("elefant"), or one real part of a longer answer
 * ("jackson" for "Michael Jackson"). Close guesses are kept out of the public chat.
 */
export function isClose(guess, word, alts) {
  const g = normalize(guess);
  if (squash(g).length < 3) return false;
  const tokens = g.split(' ');
  return answers(word, alts).some((w) => {
    const b = squash(w);
    if (levenshtein(squash(g), b) <= (b.length >= 7 ? 2 : 1)) return true;
    const parts = w.split(' ').filter((part) => part.length >= 3 && !FILLER.has(part));
    return parts.some((part) =>
      tokens.some((t) => t === part || (part.length >= 5 && levenshtein(t, part) <= (part.length >= 8 ? 2 : 1))),
    );
  });
}
