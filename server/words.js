import fs from 'node:fs';
import { CATEGORY_META, parseCustomWords } from '../shared/constants.js';

// Hand-picked classics, grouped by category and difficulty. These are merged with the
// generated word bank below and always keep the difficulty given here.
const HANDPICKED = {
  animals: {
    easy: ['cat', 'dog', 'fish', 'bird', 'cow', 'pig', 'duck', 'frog', 'snake', 'lion', 'bear', 'horse', 'sheep', 'mouse', 'rabbit', 'owl', 'bee', 'spider', 'monkey', 'turtle', 'elephant', 'giraffe', 'chicken', 'snail', 'whale', 'shark', 'butterfly', 'ant', 'crab', 'zebra'],
    medium: ['penguin', 'kangaroo', 'octopus', 'dolphin', 'camel', 'crocodile', 'flamingo', 'peacock', 'squirrel', 'hedgehog', 'koala', 'panda', 'parrot', 'jellyfish', 'starfish', 'seahorse', 'ladybug', 'gorilla', 'rhinoceros', 'hippo', 'bat', 'deer', 'wolf', 'fox', 'lobster', 'caterpillar', 'dragonfly', 'goldfish', 'polar bear', 'tiger'],
    hard: ['chameleon', 'platypus', 'sloth', 'armadillo', 'porcupine', 'narwhal', 'meerkat', 'anteater', 'lemur', 'walrus', 'stingray', 'mosquito', 'scorpion', 'pelican', 'woodpecker', 'hummingbird', 'axolotl', 'raccoon', 'beaver', 'moose'],
  },
  food: {
    easy: ['apple', 'banana', 'pizza', 'cake', 'egg', 'bread', 'cheese', 'carrot', 'ice cream', 'cookie', 'grapes', 'milk', 'orange', 'burger', 'candy', 'corn', 'watermelon', 'cherry', 'lemon', 'strawberry', 'donut', 'popcorn', 'pear', 'sandwich', 'soup'],
    medium: ['spaghetti', 'pancake', 'hot dog', 'french fries', 'cupcake', 'broccoli', 'pineapple', 'popsicle', 'taco', 'sushi', 'mushroom', 'pumpkin', 'cucumber', 'coconut', 'avocado', 'lollipop', 'pretzel', 'muffin', 'salad', 'chocolate', 'honey', 'peanut', 'toast', 'waffle', 'noodles'],
    hard: ['lasagna', 'burrito', 'croissant', 'cotton candy', 'gingerbread man', 'smoothie', 'kebab', 'dumpling', 'cinnamon roll', 'birthday cake', 'fortune cookie', 'milkshake', 'omelette', 'nachos', 'pomegranate', 'asparagus', 'baguette', 'marshmallow', 'barbecue', 'popcorn chicken'],
  },
  objects: {
    easy: ['chair', 'table', 'bed', 'door', 'key', 'ball', 'book', 'clock', 'cup', 'hat', 'shoe', 'sock', 'phone', 'lamp', 'spoon', 'fork', 'box', 'umbrella', 'glasses', 'pencil', 'scissors', 'toothbrush', 'balloon', 'candle', 'bell', 'crown', 'gift', 'window', 'bag', 'comb'],
    medium: ['backpack', 'ladder', 'hammer', 'toothpaste', 'pillow', 'mirror', 'camera', 'guitar', 'headphones', 'sunglasses', 'flashlight', 'envelope', 'teapot', 'keyboard', 'magnet', 'trophy', 'wallet', 'bucket', 'broom', 'paintbrush', 'calendar', 'light bulb', 'remote control', 'piano', 'drum'],
    hard: ['microscope', 'telescope', 'chandelier', 'hourglass', 'compass', 'stethoscope', 'typewriter', 'megaphone', 'thermometer', 'wheelbarrow', 'sewing machine', 'vacuum cleaner', 'fire extinguisher', 'padlock', 'binoculars', 'saxophone', 'accordion', 'harmonica'],
  },
  actions: {
    easy: ['run', 'jump', 'sleep', 'eat', 'swim', 'dance', 'sing', 'cry', 'laugh', 'read', 'write', 'walk', 'fly', 'kick', 'clap', 'smile', 'cook', 'wave', 'drink', 'throw'],
    medium: ['juggling', 'fishing', 'skiing', 'surfing', 'painting', 'sneeze', 'yawn', 'whisper', 'climb', 'dive', 'knitting', 'brushing teeth', 'camping', 'gardening', 'hug', 'wink', 'shopping', 'typing', 'snoring', 'baking'],
    hard: ['sleepwalking', 'meditating', 'hibernate', 'daydreaming', 'tightrope walking', 'breakdancing', 'sunbathing', 'snorkeling', 'parachuting', 'hitchhiking', 'sword fighting', 'moonwalk', 'tiptoe', 'stargazing'],
  },
  nature: {
    easy: ['sun', 'moon', 'star', 'tree', 'flower', 'rain', 'cloud', 'house', 'beach', 'mountain', 'river', 'snow', 'rainbow', 'island', 'fire', 'leaf', 'school', 'park', 'garden', 'sea'],
    medium: ['volcano', 'waterfall', 'castle', 'desert', 'forest', 'lighthouse', 'igloo', 'tornado', 'cave', 'bridge', 'farm', 'hospital', 'library', 'zoo', 'campfire', 'playground', 'swimming pool', 'cactus', 'palm tree', 'lightning', 'snowman', 'planet'],
    hard: ['Eiffel Tower', 'pyramid', 'Statue of Liberty', 'aquarium', 'skyscraper', 'avalanche', 'glacier', 'coral reef', 'observatory', 'windmill', 'oasis', 'amusement park', 'solar eclipse', 'Great Wall', 'galaxy', 'quicksand'],
  },
  sports: {
    easy: ['soccer', 'basketball', 'tennis', 'golf', 'baseball', 'chess', 'dice', 'kite', 'bicycle', 'boxing', 'karate', 'goal', 'swing', 'slide'],
    medium: ['volleyball', 'bowling', 'archery', 'trampoline', 'hula hoop', 'yo-yo', 'puzzle', 'playing cards', 'dominoes', 'surfboard', 'skateboard', 'hockey', 'ping pong', 'marathon', 'medal', 'whistle', 'goalkeeper', 'jump rope', 'teddy bear'],
    hard: ['fencing', 'gymnastics', 'figure skating', 'water polo', 'bungee jumping', 'rock climbing', 'tug of war', 'hide and seek', 'musical chairs', 'hopscotch', 'scuba diving', 'referee', 'cartwheel', 'sumo wrestling'],
  },
  fantasy: {
    easy: ['ghost', 'robot', 'alien', 'dragon', 'king', 'queen', 'pirate', 'monster', 'witch', 'angel', 'clown', 'mermaid', 'unicorn', 'superhero', 'ninja', 'wizard', 'fairy', 'zombie', 'princess', 'cowboy'],
    medium: ['vampire', 'treasure chest', 'magic wand', 'flying carpet', 'spaceship', 'haunted house', 'Santa Claus', 'snow globe', 'birthday party', 'time machine', 'crystal ball', 'genie', 'knight', 'troll', 'werewolf', 'mummy', 'scarecrow', 'tooth fairy', 'treasure map'],
    hard: ['Easter bunny', 'leprechaun', 'invisible man', 'Trojan horse', 'cyclops', 'phoenix', 'centaur', 'pegasus', 'Loch Ness Monster', 'Medusa', 'Minotaur', 'Frankenstein', 'fairy godmother', 'black hole'],
  },
  vehicles: {
    easy: ['car', 'bus', 'train', 'airplane', 'boat', 'truck', 'rocket', 'tractor', 'taxi', 'ship', 'computer', 'TV', 'robot arm', 'wheel'],
    medium: ['helicopter', 'submarine', 'motorcycle', 'ambulance', 'fire truck', 'police car', 'hot air balloon', 'scooter', 'sailboat', 'canoe', 'laptop', 'video game', 'smartphone', 'drone', 'satellite', 'traffic light', 'wheelchair', 'parachute'],
    hard: ['bulldozer', 'cable car', 'roller coaster', 'steam engine', 'space station', 'jet ski', 'monorail', 'forklift', 'Ferris wheel', 'escalator', 'wind turbine', 'virtual reality', 'solar panel', 'excavator'],
  },
  people: {
    easy: ['baby', 'doctor', 'teacher', 'chef', 'farmer', 'nurse', 'artist', 'singer', 'police officer', 'firefighter', 'grandma', 'grandpa', 'family', 'pilot', 'student', 'twins'],
    medium: ['astronaut', 'dentist', 'mail carrier', 'lifeguard', 'magician', 'scientist', 'photographer', 'plumber', 'mechanic', 'waiter', 'detective', 'judge', 'cheerleader', 'baker', 'carpenter', 'DJ'],
    hard: ['archaeologist', 'ventriloquist', 'lumberjack', 'beekeeper', 'conductor', 'architect', 'zookeeper', 'puppeteer', 'mime', 'tailor', 'barber', 'astronomer', 'librarian', 'stuntman'],
  },
};

const DIFFS = ['easy', 'medium', 'hard'];

// Thousands more drawable words generated from WordNet + SCOWL (see scripts/build-words.mjs).
const GENERATED = JSON.parse(fs.readFileSync(new URL('./wordbank.json', import.meta.url), 'utf8'));

/** category -> difficulty -> [word]; every word appears once across the whole bank. */
const WORDS = {};
{
  const seen = new Set();
  const addAll = (source) => {
    for (const { id } of CATEGORY_META) {
      for (const d of DIFFS) {
        for (const w of source[id]?.[d] ?? []) {
          const key = w.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          ((WORDS[id] ??= { easy: [], medium: [], hard: [] })[d]).push(w);
        }
      }
    }
  };
  addAll(HANDPICKED);
  addAll(GENERATED);
}

export const TOTAL_WORDS = Object.values(WORDS).reduce((n, c) => n + c.easy.length + c.medium.length + c.hard.length, 0);

/** How many words the current settings can draw from (shown in the lobby). */
export function poolSize(settings) {
  const custom = parseCustomWords(settings.customWords).length;
  if (settings.customOnly && custom) return custom;
  const cats = settings.categories.length ? settings.categories : CATEGORY_META.map((c) => c.id);
  const diffs = settings.difficulty === 'mixed' ? DIFFS : [settings.difficulty];
  let n = custom;
  for (const c of cats) for (const d of diffs) n += WORDS[c]?.[d]?.length ?? 0;
  return n;
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** "🐾 Animals" — shown by the 🔍 Category Clue card. */
export function categoryLabel(id) {
  if (id === 'custom') return '✏️ Custom words';
  const c = CATEGORY_META.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.label}` : '❓ Mystery';
}

/** [{ w: word, c: category }] for the chosen categories at one difficulty. */
function poolFor(categories, difficulty) {
  const cats = categories.length ? categories : CATEGORY_META.map((c) => c.id);
  const out = [];
  for (const c of cats) for (const w of WORDS[c]?.[difficulty] ?? []) out.push({ w, c });
  return out;
}

/**
 * Pick `count` word options for the drawer.
 * Returns [{ word, difficulty }]. `used` is a Set of lowercase words this room has already
 * seen (offered or played); they're only repeated once a pool runs out.
 */
export function pickWords(settings, used, count) {
  const custom = parseCustomWords(settings.customWords);
  const picked = [];
  const taken = new Set();

  const take = (pool, difficulty) => {
    let fresh = pool.filter((e) => !used.has(e.w.toLowerCase()) && !taken.has(e.w.toLowerCase()));
    if (!fresh.length) fresh = pool.filter((e) => !taken.has(e.w.toLowerCase()));
    if (!fresh.length) return false;
    const { w: word, c: category } = rand(fresh);
    taken.add(word.toLowerCase());
    picked.push({ word, difficulty, category });
    return true;
  };
  const customPool = custom.map((w) => ({ w, c: 'custom' }));

  if (settings.customOnly && custom.length) {
    for (let i = 0; i < count; i++) take(customPool, 'custom');
    return picked;
  }

  // Mix one custom word into the choices when the host added some.
  if (custom.length && count > 1) take(customPool, 'custom');

  while (picked.length < count) {
    const slot = picked.length;
    const difficulty =
      settings.difficulty === 'mixed' ? (count === 3 ? DIFFS[slot] : rand(DIFFS)) : settings.difficulty;
    if (!take(poolFor(settings.categories, difficulty), difficulty)) {
      // Category/difficulty combination ran dry: fall back to every word.
      if (!take(poolFor([], difficulty), difficulty)) break;
    }
  }
  return picked;
}
