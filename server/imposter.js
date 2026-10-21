// 🕵️ Imposter: everyone gets the secret word except the imposter(s). Players take turns giving
// one-word clues, then vote on who's faking it. A caught imposter gets one last chance to
// guess the word and steal the win.
import { categoryLabel, pickWords } from './words.js';

const GUESS_TIME = 25; // seconds for a caught imposter to guess the word
const REVEAL_TIME = 12; // seconds the round result is shown
const MIN_PLAYERS = 3;

// Points per round.
const POINTS = {
  crewWin: 100, // every crew member when the imposter is caught
  rightVote: 50, // bonus for voting for an imposter
  imposterWin: 300, // the imposter fools everyone
  imposterGuess: 200, // caught, but guessed the word
};

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export class ImposterGame {
  /** @param {import('./room.js').Room} room */
  constructor(room, normalize) {
    this.kind = 'imposter';
    this.room = room;
    this.normalize = normalize;
    this.round = 0;
    this.r = null; // current round
    this.timesImposter = new Map(); // pid -> count, so the role rotates fairly
  }

  get settings() {
    return this.room.settings;
  }

  start() {
    this.round = 0;
    this.timesImposter.clear();
    this.nextRound();
  }

  // ───────────────────────── round flow ─────────────────────────

  nextRound() {
    const room = this.room;
    const online = room.connectedPlayers();
    if (online.length < MIN_PLAYERS) return room.endGame('Imposter needs at least 3 players.');
    this.round++;
    if (this.round > this.settings.rounds) return room.endGame();

    // Fair rotation: whoever has been the imposter least often goes next (random tie-break).
    const want = this.settings.imposters === 2 && online.length >= 6 ? 2 : 1;
    const imposters = shuffle([...online])
      .sort((a, b) => (this.timesImposter.get(a.id) ?? 0) - (this.timesImposter.get(b.id) ?? 0))
      .slice(0, want);
    for (const p of imposters) this.timesImposter.set(p.id, (this.timesImposter.get(p.id) ?? 0) + 1);
    const imposterIds = new Set(imposters.map((p) => p.id));

    // Clue order: random, but an imposter never has to go first.
    const order = shuffle(online.map((p) => p.id));
    if (imposterIds.has(order[0])) {
      const swap = order.findIndex((id) => !imposterIds.has(id));
      [order[0], order[swap]] = [order[swap], order[0]];
    }

    // Easy/medium words make the best clues (hard ones are too obscure to hint at).
    const difficulty =
      this.settings.difficulty === 'mixed' ? (Math.random() < 0.5 ? 'easy' : 'medium') : this.settings.difficulty;
    const [choice] = pickWords({ ...this.settings, difficulty, wordChoices: 1 }, room.usedWords, 1);
    room.usedWords.add(choice.word.toLowerCase());

    this.r = {
      word: choice.word,
      category: categoryLabel(choice.category),
      imposterIds,
      order,
      clueRound: 1,
      turn: 0,
      clues: new Map(order.map((id) => [id, []])), // pid -> [clue | null (skipped)]
      votes: new Map(), // voter -> target
      accusedId: null,
      guess: null,
      reveal: null,
      endsAt: 0,
      duration: 0,
    };
    room.phase = 'clues';
    room.system(`🕵️ Round ${this.round} of ${this.settings.rounds} — check your secret role!`);
    this.startClueTurn();
  }

  currentClueGiver() {
    return this.r?.order[this.r.turn] ?? null;
  }

  startClueTurn() {
    const r = this.r;
    // Skip anyone who has left the room entirely.
    while (r.turn < r.order.length && !this.room.players.has(r.order[r.turn])) r.turn++;
    if (r.turn >= r.order.length) return this.endClueRound();
    r.endsAt = Date.now() + this.settings.clueTime * 1000;
    r.duration = this.settings.clueTime;
    this.room.broadcast();
  }

  endClueRound() {
    const r = this.r;
    if (r.clueRound < this.settings.clueRounds) {
      r.clueRound++;
      r.turn = 0;
      return this.startClueTurn();
    }
    this.room.phase = 'vote';
    r.endsAt = Date.now() + this.settings.voteTime * 1000;
    r.duration = this.settings.voteTime;
    this.room.system('🗳️ Time to vote! Who is the imposter? Discuss in the chat.');
    this.room.broadcast();
  }

  advanceClue(pid, clue) {
    const r = this.r;
    r.clues.get(pid)?.push(clue);
    r.turn++;
    this.startClueTurn();
  }

  /** Does `clue` give the secret word away? */
  givesAway(clue) {
    const c = this.normalize(clue).replace(/ /g, '');
    const w = this.normalize(this.r.word);
    if (!c) return true;
    if (c === w.replace(/ /g, '')) return true;
    // The clue contains the word, or a meaningful part of it ("bears" / "bear" for "polar bear").
    return w.split(' ').some((part) => part.length >= 3 && c.includes(part));
  }

  submitClue(pid, text) {
    const room = this.room;
    const r = this.r;
    if (room.phase !== 'clues' || !r || this.currentClueGiver() !== pid) return;
    const clue = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!clue) return;
    if (clue.split(' ').length > 2) return room.whisper(pid, '✋ Keep it short: one word (two at most)!');
    // Imposters don't know the word, so their clues are never checked (that would leak it).
    if (!r.imposterIds.has(pid) && this.givesAway(clue)) {
      return room.whisper(pid, "🤫 That gives the word away! Try a sneakier clue.");
    }
    this.advanceClue(pid, clue);
  }

  vote(pid, targetId) {
    const room = this.room;
    const r = this.r;
    if (room.phase !== 'vote' || !r || pid === targetId) return;
    if (!room.players.has(pid) || !room.players.has(targetId)) return;
    r.votes.set(pid, targetId);
    // Everyone online has voted: no need to wait for the clock.
    const voters = room.connectedPlayers();
    if (voters.every((p) => r.votes.has(p.id))) this.tally();
    else room.broadcast();
  }

  tally() {
    const r = this.r;
    const counts = new Map();
    for (const target of r.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    const leaders = [...counts].filter(([, n]) => n === top).map(([id]) => id);
    if (!top || leaders.length > 1) return this.finish('tie');
    r.accusedId = leaders[0];
    if (!r.imposterIds.has(r.accusedId)) return this.finish('wrong');
    // Caught! One last chance to guess the word.
    this.room.phase = 'guess';
    r.endsAt = Date.now() + GUESS_TIME * 1000;
    r.duration = GUESS_TIME;
    const p = this.room.players.get(r.accusedId);
    this.room.system(`🚨 ${p?.name ?? 'The imposter'} was caught! They get one chance to guess the word…`);
    this.room.broadcast();
  }

  imposterGuess(pid, text) {
    const r = this.r;
    if (this.room.phase !== 'guess' || !r || pid !== r.accusedId) return;
    const g = this.normalize(String(text ?? '').slice(0, 40));
    if (!g) return;
    const w = this.normalize(r.word);
    r.guess = String(text).trim().slice(0, 40);
    const right = g === w || g.replace(/ /g, '') === w.replace(/ /g, '') || ` ${g} `.includes(` ${w} `);
    this.finish(right ? 'imposterGuessed' : 'caught');
  }

  /** outcome: caught | imposterGuessed | wrong | tie | imposterLeft */
  finish(outcome) {
    const room = this.room;
    const r = this.r;
    const gains = new Map();
    const give = (pid, pts) => {
      const p = room.players.get(pid);
      if (!p || !pts) return;
      p.score += pts;
      gains.set(pid, (gains.get(pid) ?? 0) + pts);
    };
    const crew = [...room.players.keys()].filter((id) => !r.imposterIds.has(id));
    const rightVoters = [...r.votes].filter(([, target]) => r.imposterIds.has(target)).map(([voter]) => voter);
    for (const id of rightVoters) {
      const p = room.players.get(id);
      if (p && !r.imposterIds.has(id)) p.correct++;
    }

    if (outcome === 'caught') {
      for (const id of crew) give(id, POINTS.crewWin);
      for (const id of rightVoters) give(id, POINTS.rightVote);
    } else if (outcome === 'imposterGuessed') {
      give(r.accusedId, POINTS.imposterGuess);
      for (const id of rightVoters) give(id, POINTS.rightVote);
    } else if (outcome === 'wrong' || outcome === 'tie') {
      for (const id of r.imposterIds) give(id, POINTS.imposterWin);
    }

    const names = [...r.imposterIds].map((id) => room.players.get(id)?.name ?? 'someone').join(' & ');
    const lines = {
      caught: `🎉 The crew wins! ${names} was the imposter. The word was "${r.word}"`,
      imposterGuessed: `😱 ${names} was caught, but guessed "${r.word}" and steals the win!`,
      wrong: `🕵️ Wrong person! ${names} was the imposter and wins. The word was "${r.word}"`,
      tie: `🕵️ The vote was a tie, so ${names} gets away with it! The word was "${r.word}"`,
      imposterLeft: `The imposter left, so this round doesn't count. The word was "${r.word}"`,
    };
    room.system(lines[outcome]);

    r.reveal = {
      outcome,
      word: r.word,
      category: r.category,
      imposterIds: [...r.imposterIds],
      accusedId: r.accusedId,
      guess: r.guess,
      votes: [...r.votes].map(([voter, target]) => ({ voter, target })),
      gains: [...gains].map(([id, pts]) => ({ id, pts })).sort((a, b) => b.pts - a.pts),
    };
    room.phase = 'impReveal';
    r.endsAt = Date.now() + REVEAL_TIME * 1000;
    r.duration = REVEAL_TIME;
    room.broadcast();
  }

  tick(now) {
    const room = this.room;
    const r = this.r;
    if (!r || now < r.endsAt) return;
    if (room.phase === 'clues') {
      const pid = this.currentClueGiver();
      const p = room.players.get(pid);
      if (p) room.system(`⏰ ${p.name} ran out of time`);
      this.advanceClue(pid, null);
    } else if (room.phase === 'vote') {
      this.tally();
    } else if (room.phase === 'guess') {
      this.finish('caught');
    } else if (room.phase === 'impReveal' && room.connectedPlayers().length >= MIN_PLAYERS) {
      this.nextRound();
    }
  }

  /** `left` = gone for good; otherwise just disconnected (they keep their spot). */
  onPlayerGone(p, left) {
    const r = this.r;
    if (!r || !left) {
      if (this.room.phase === 'vote' && r) this.maybeAllVoted();
      return;
    }
    if (r.imposterIds.has(p.id) && ['clues', 'vote', 'guess'].includes(this.room.phase)) {
      r.imposterIds.delete(p.id);
      if (!r.imposterIds.size) return this.finish('imposterLeft');
    }
    r.votes.delete(p.id);
    if (this.room.phase === 'clues' && this.currentClueGiver() === p.id) this.advanceClue(p.id, null);
    else if (this.room.phase === 'vote') this.maybeAllVoted();
  }

  maybeAllVoted() {
    const voters = this.room.connectedPlayers();
    if (voters.length && voters.every((p) => this.r.votes.has(p.id))) this.tally();
  }

  /** Keep the secret word out of the chat (returns true if the message was blocked). */
  filterChat(p, text) {
    const r = this.r;
    if (!r || this.room.phase === 'impReveal' || r.imposterIds.has(p.id)) return false;
    const w = this.normalize(r.word);
    if (` ${this.normalize(text)} `.includes(` ${w} `)) {
      this.room.whisper(p.id, "🤫 Don't say the secret word in the chat!");
      return true;
    }
    return false;
  }

  snapshot(me) {
    const r = this.r;
    if (!r) return { round: this.round, rounds: this.settings.rounds };
    const isImposter = r.imposterIds.has(me.id);
    const revealed = this.room.phase === 'impReveal';
    return {
      round: this.round,
      rounds: this.settings.rounds,
      role: isImposter ? 'imposter' : 'crew',
      word: isImposter && !revealed ? null : r.word,
      category: r.category,
      imposterCount: r.imposterIds.size || 1,
      order: r.order,
      current: this.room.phase === 'clues' ? this.currentClueGiver() : null,
      clueRound: r.clueRound,
      clueRounds: this.settings.clueRounds,
      clues: r.order.map((id) => ({ id, clues: r.clues.get(id) ?? [] })),
      voted: [...r.votes.keys()],
      myVote: r.votes.get(me.id) ?? null,
      accusedId: this.room.phase === 'guess' || revealed ? r.accusedId : null,
      endsAt: r.endsAt,
      duration: r.duration,
      reveal: revealed ? r.reveal : null,
    };
  }
}
