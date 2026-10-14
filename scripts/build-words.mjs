// Builds server/wordbank.json: thousands of drawable, family-friendly words.
//
//   npm run words
//
// Sources (installed as devDependencies, only needed to regenerate the file):
//   - WordNet 3.1 (wordnet-db): every noun is filed under a category such as noun.animal,
//     noun.food or noun.artifact, plus a hypernym ("is a kind of") tree. That tells us which
//     words are concrete, drawable things and lets us sort them into the game's categories.
//   - SCOWL word lists (wordlist-english): words ranked by how common they are (10 = everyday,
//     50 = rare). Used to drop obscure words and to set easy / medium / hard.
//   - naughty-words (LDNOOBW list) + our own blocklist to keep it family-friendly.
// The hand-written lists in server/words.js are merged on top and always win.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = require('wordnet-db').path;
const scowl = require('wordlist-english');
const naughty = require('naughty-words');

// ───────────────────────── word commonness (SCOWL) ─────────────────────────

const LEVELS = [10, 20, 35, 40, 50];
const level = new Map();
for (const lv of LEVELS) {
  for (const variant of ['english', 'english/american']) {
    for (const w of scowl[`${variant}/${lv}`] ?? []) {
      const k = w.toLowerCase();
      if (!level.has(k) || level.get(k) > lv) level.set(k, lv);
    }
  }
}

// ───────────────────────── WordNet nouns ─────────────────────────

const LEX = { 5: 'animal', 6: 'artifact', 13: 'food', 15: 'location', 17: 'object', 18: 'person', 19: 'phenomenon', 20: 'plant', 4: 'act', 27: 'substance', 8: 'body' };

/** offset -> { lex, words: [lemma], hypernyms: [offset] } */
const synsets = new Map();
for (const line of fs.readFileSync(path.join(dict, 'data.noun'), 'utf8').split('\n')) {
  if (!/^\d{8} /.test(line)) continue;
  const [head] = line.split(' | ');
  const parts = head.trim().split(/\s+/);
  const offset = parts[0];
  const lex = Number(parts[1]);
  const wCnt = parseInt(parts[3], 16);
  const words = [];
  let i = 4;
  for (let k = 0; k < wCnt; k++, i += 2) words.push(parts[i]);
  const pCnt = Number(parts[i++]);
  const hypernyms = [];
  let usage = false;
  for (let k = 0; k < pCnt; k++, i += 4) {
    const sym = parts[i];
    if (sym === '@' || sym === '@i') hypernyms.push(parts[i + 1]);
    if (sym === ';u') usage = true; // slang / vulgarism / ethnic slur / disparagement…
  }
  synsets.set(offset, { lex, words, hypernyms, usage, offset });
}

/** lemma -> [offset] in order of how common each meaning is */
const senses = new Map();
for (const line of fs.readFileSync(path.join(dict, 'index.noun'), 'utf8').split('\n')) {
  if (!line || line.startsWith(' ')) continue;
  const parts = line.trim().split(/\s+/);
  const synsetCnt = Number(parts[2]);
  senses.set(parts[0], parts.slice(parts.length - synsetCnt));
}

// How many meanings a word has as a verb / adjective — words that are mostly adjectives or
// verbs ("low", "draw", "empty") make poor drawing prompts even if they have a noun meaning.
function senseCounts(file) {
  const counts = new Map();
  for (const line of fs.readFileSync(path.join(dict, file), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const parts = line.split(' ');
    counts.set(parts[0], Number(parts[2]));
  }
  return counts;
}
const verbSenses = senseCounts('index.verb');
const adjSenses = senseCounts('index.adj');

// Ancestors (all hypernyms up to the root) and depth, memoised.
const ancestorCache = new Map();
function ancestors(offset) {
  if (ancestorCache.has(offset)) return ancestorCache.get(offset);
  const out = new Set();
  ancestorCache.set(offset, out);
  for (const h of synsets.get(offset)?.hypernyms ?? []) {
    out.add(h);
    for (const a of ancestors(h)) out.add(a);
  }
  return out;
}
// How many synsets sit below each synset — very general words ("device", "container") have lots.
const descendants = new Map();
for (const off of synsets.keys()) for (const a of ancestors(off)) descendants.set(a, (descendants.get(a) ?? 0) + 1);

/** Synset offset for "lemma" whose category is `lex` (its most common such meaning). */
function anchor(lemma, lex) {
  const offs = senses.get(lemma) ?? [];
  const off = offs.find((o) => LEX[synsets.get(o)?.lex] === lex) ?? offs[0];
  if (!off) console.warn(`  (no WordNet entry for "${lemma}", skipped)`);
  return off ?? null;
}
const under = (offset, anchors) => anchors.some((a) => a && (a === offset || ancestors(offset).has(a)));

// A word belongs to a game category only if it sits under one of these WordNet branches
// (first match wins, so the order matters: a computer is a device, but goes to tech).
const CATEGORY_BRANCHES = [
  ['animals', [['mammal', 'animal'], ['bird', 'animal'], ['fish', 'animal'], ['reptile', 'animal'], ['amphibian', 'animal'], ['insect', 'animal'], ['arachnid', 'animal'], ['crustacean', 'animal'], ['mollusk', 'animal'], ['worm', 'animal'], ['dinosaur', 'animal'], ['jellyfish', 'animal'], ['starfish', 'animal']]],
  ['food', [['dish', 'food'], ['baked_goods', 'food'], ['edible_fruit', 'food'], ['vegetable', 'food'], ['dessert', 'food'], ['sweet', 'food'], ['beverage', 'food'], ['meat', 'food'], ['sandwich', 'food'], ['bread', 'food'], ['cheese', 'food'], ['edible_nut', 'food'], ['candy', 'food'], ['condiment', 'food'], ['soup', 'food'], ['pasta', 'food'], ['seafood', 'food'], ['dairy_product', 'food'], ['egg', 'food']]],
  ['vehicles', [['vehicle', 'artifact'], ['craft', 'artifact'], ['computer', 'artifact'], ['telephone', 'artifact'], ['camera', 'artifact'], ['radio', 'artifact'], ['television', 'artifact'], ['robot', 'artifact'], ['home_appliance', 'artifact'], ['clock', 'artifact'], ['loudspeaker', 'artifact'], ['microphone', 'artifact'], ['headphone', 'artifact'], ['calculator', 'artifact']]],
  ['sports', [['sports_equipment', 'artifact'], ['game_equipment', 'artifact'], ['toy', 'artifact'], ['ball', 'artifact'], ['sport', 'act']]],
  ['nature', [['natural_elevation', 'object'], ['body_of_water', 'object'], ['celestial_body', 'object'], ['geological_formation', 'object'], ['tree', 'plant'], ['flower', 'plant'], ['shrub', 'plant'], ['cactus', 'plant'], ['fern', 'plant'], ['vine', 'plant'], ['atmospheric_phenomenon', 'phenomenon'], ['building', 'artifact'], ['bridge', 'artifact'], ['tower', 'artifact'], ['monument', 'artifact'], ['fountain', 'artifact'], ['tent', 'artifact'], ['dwelling', 'artifact']]],
  ['people', [['skilled_worker', 'person'], ['craftsman', 'person'], ['professional', 'person'], ['performer', 'person'], ['athlete', 'person'], ['serviceman', 'person'], ['sovereign', 'person'], ['artist', 'person'], ['musician', 'person'], ['scientist', 'person'], ['farmer', 'person'], ['cook', 'person'], ['policeman', 'person'], ['firefighter', 'person'], ['sailor', 'person'], ['pilot', 'person']]],
  ['fantasy', [['imaginary_being', 'person'], ['mythical_monster', 'person']]],
  ['objects', [['furnishing', 'artifact'], ['container', 'artifact'], ['clothing', 'artifact'], ['footwear', 'artifact'], ['headdress', 'artifact'], ['implement', 'artifact'], ['utensil', 'artifact'], ['musical_instrument', 'artifact'], ['jewelry', 'artifact'], ['decoration', 'artifact'], ['tableware', 'artifact'], ['cutlery', 'artifact'], ['toiletry', 'artifact'], ['bag', 'artifact'], ['lamp', 'artifact']]],
  // Generic "devices" are mostly machine parts: only everyday single words from here.
  ['objects:device', [['device', 'artifact']]],
].map(([cat, list]) => [cat, list.map(([w, lex]) => anchor(w, lex)).filter(Boolean)]);

// Branches we never want in a family game.
const BLOCKED_BRANCHES = [
  ['drug', 'artifact'], ['narcotic', 'artifact'], ['drug_of_abuse', 'artifact'], ['contraceptive', 'artifact'],
  ['firearm', 'artifact'], ['explosive_device', 'artifact'], ['bomb', 'artifact'], ['ammunition', 'artifact'],
  ['weapon_of_mass_destruction', 'artifact'], ['instrument_of_execution', 'artifact'], ['instrument_of_punishment', 'artifact'],
  ['alcohol', 'food'], ['tobacco', 'artifact'], ['cigarette', 'artifact'], ['cannabis', 'plant'],
  ['restraint', 'artifact'], ['undergarment', 'artifact'], ['prison', 'artifact'], ['coffin', 'artifact'],
  ['gambling_game', 'act'], ['slot_machine', 'artifact'], ['blood_sport', 'act'], ['bar', 'artifact'],
  ['brothel', 'artifact'], ['casino', 'artifact'], ['jail', 'artifact'], ['gas_chamber', 'artifact'],
  ['slaughterhouse', 'artifact'], ['mortuary', 'artifact'], ['tavern', 'artifact'], ['weapon', 'artifact'],
].map(([w, lex]) => anchor(w, lex)).filter(Boolean);

// Safety net: anything containing these word roots is dropped.
const UNSAFE_ROOTS = /\b(sex|porn|whore|brothel|nazi|rape|kill|murder|suicide|drug|cocaine|opium|booze|beer|wine|vodka|whisk|gun|bomb|nude|naked|slave|tortur|execut|corpse|dead|death|blood|bullet|knife fight|war\b|warlord|bra\b|butt\b|poop|pee\b|fart)/;
// Odd or misleading single words that slip through the rules above.
const ODD_WORDS = new Set(`human mankind humankind beef mount adapter adaptor tore gig mike duff buck pub
dispensary earner breadwinner practitioner demonstrator caster prompter extra mate private counsel
checker heavy familiar master forward tackle academic hanging shading empty portable remote
electric thrift binary mere narrow low draw bolt chequer plate floating queen mum pit oxen scad
choppiness mildness inversion uphill sandblast flophouse roadhouse eatery perfecter ordinary pro
aide grower recruit amphibian broiler galley cooler shinny mound rook shuttle object_ball
court_tennis real_tennis royal_tennis deck_tennis clock_golf racing_gig slip_carriage
attack_aircraft rat_cheese water_lemon bell_apple ship_biscuit drawn_butter brown_butter
brick_cheese orange_toast dry_milk ice_milk fizz potion`.split(/\s+/).map((w) => w.replace(/_/g, ' ')));

const BLOCKLIST = new Set([
  ...naughty.en.map((w) => w.toLowerCase()),
  // Extra words that are unsuitable, gross or too dark for a family drawing game.
  ...`bitch booby hooker hustler pimp stripper gigolo mistress slave savage dummy moron idiot
  imbecile negro gypsy eskimo coolie harem bra panties thong diaper tampon condom syringe pill
  heroin opium meth gun rifle pistol revolver shotgun bullet grenade missile torpedo landmine
  noose gallows guillotine electric_chair casket corpse cadaver crematorium morgue slaughterhouse
  abattoir executioner hangman sniper terrorist assassin murderer killer hitman torturer jailer
  convict prisoner hostage beer wine whiskey vodka gin rum brandy liquor cocktail champagne lager
  ale martini tequila sake cigar cigarette hookah bong ashtray casino gambler bookie roulette
  lottery pawnbroker loan_shark witch_doctor voodoo devil demon satan lucifer hell fiend leech
  louse lice maggot roach bedbug tapeworm parasite vomit urinal bedpan enema chamber_pot sewer
  cesspool latrine slop swill offal tripe nude stud crack_house dope weed hash spliff reefer`
    .split(/\s+/)
    .filter(Boolean),
]);
const blockedWord = (lemma) => {
  const l = lemma.toLowerCase();
  if (ODD_WORDS.has(l) || UNSAFE_ROOTS.test(l)) return true;
  return BLOCKLIST.has(l) || BLOCKLIST.has(l.replace(/ /g, '_')) || l.split(' ').some((part) => BLOCKLIST.has(part));
};

/** Which game category a synset belongs to, or null if it's not something we'd draw. */
function categorize(s) {
  if (s.usage || under(s.offset, BLOCKED_BRANCHES)) return null;
  for (const [cat, branches] of CATEGORY_BRANCHES) if (under(s.offset, branches)) return cat;
  return null;
}

// How "general" a word is — generic words ("device", "tool", "container") are hard to draw.
function tooGeneric(s) {
  const below = descendants.get(s.offset) ?? 0;
  const depth = ancestors(s.offset).size;
  return below > 60 || depth < 6;
}

/** SCOWL level for a lemma; multi-word lemmas use their rarest word. */
function wordLevel(lemma) {
  const parts = lemma.toLowerCase().split(/[ -]/);
  let worst = 0;
  for (const p of parts) {
    const lv = level.get(p);
    if (!lv) return null;
    worst = Math.max(worst, lv);
  }
  return worst;
}

function difficulty(lemma, lv, cat) {
  const multi = lemma.includes(' ');
  const len = lemma.replace(/ /g, '').length;
  if (multi) return lv <= 10 ? 'medium' : 'hard';
  if (cat === 'people') {
    // Jobs are harder to draw than things: shift them up a level.
    if (lv <= 10 && len <= 8) return 'easy';
    return lv <= 20 ? 'medium' : lv <= 35 ? 'hard' : null;
  }
  if (lv <= 10 && len <= 8) return 'easy';
  if (lv <= 20 && len <= 7) return 'easy';
  if (lv <= 35) return 'medium';
  if (lv <= 40) return 'hard';
  // Rarer animals are still fun to draw and guess.
  if (lv <= 50 && cat === 'animals') return 'hard';
  return null;
}

// ───────────────────────── build ─────────────────────────

const out = {};
const seen = new Set();
const add = (cat, diff, word) => {
  const key = word.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  ((out[cat] ??= { easy: [], medium: [], hard: [] })[diff]).push(word);
};

/** Category of a lemma's most common meaning (null if that meaning isn't drawable). */
function mainCategory(lemmaKey) {
  const s = synsets.get(senses.get(lemmaKey)?.[0]);
  // Proper nouns (capitalised in WordNet) are skipped.
  if (!s || s.words.some((w) => w.toLowerCase() === lemmaKey && w !== w.toLowerCase())) return null;
  if (tooGeneric(s)) return null;
  return categorize(s);
}

for (const lemmaKey of senses.keys()) {
  const lemma = lemmaKey.replace(/_/g, ' ');
  if (!/^[a-z][a-z ]*[a-z]$/.test(lemma) || lemma.length < 3 || lemma.length > 16) continue;
  const words = lemma.split(' ');
  if (words.length > 2 || blockedWord(lemma)) continue;
  // Skip plurals when the singular exists ("cows", "cards").
  if (lemma.endsWith('s') && senses.has(lemmaKey.slice(0, -1))) continue;
  const lv = wordLevel(lemma);
  if (!lv || lv > 50) continue;

  // Only the word's most common meaning counts, so ambiguous words ("date") stay out.
  let cat = mainCategory(lemmaKey);
  if (!cat) continue;
  if (cat === 'objects:device') {
    if (words.length > 1 || lv > 35) continue;
    cat = 'objects';
  }
  if (words.length === 1) {
    // Mostly an adjective ("low", "empty") or mostly a verb ("draw", "launch")?
    const nouns = senses.get(lemmaKey).length;
    if ((adjSenses.get(lemmaKey) ?? 0) > nouns || (verbSenses.get(lemmaKey) ?? 0) > nouns * 1.5) continue;
    // "-ing" words are activities: fine as sports, odd as things or places.
    if (lemma.endsWith('ing') && cat !== 'sports') continue;
  } else {
    // Two-word names must be built from everyday words, the main word must itself be a thing
    // in the same category ("fishing rod" → rod is a thing), and only for categories where
    // that gives familiar names (animal/plant compounds are mostly obscure species).
    if (lv > 20 || !['objects', 'food', 'sports', 'vehicles'].includes(cat)) continue;
    if (mainCategory(words[1]) !== cat) continue;
  }
  const diff = difficulty(lemma, lv, cat);
  if (diff) add(cat, diff, lemma);
}

for (const cat of Object.values(out)) for (const list of Object.values(cat)) list.sort();

const file = path.join(root, 'server', 'wordbank.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');

let total = 0;
for (const [cat, d] of Object.entries(out)) {
  const n = d.easy.length + d.medium.length + d.hard.length;
  total += n;
  console.log(`${cat.padEnd(9)} ${String(n).padStart(5)}  (easy ${d.easy.length}, medium ${d.medium.length}, hard ${d.hard.length})`);
}
console.log(`total     ${String(total).padStart(5)} → ${path.relative(root, file)}`);
