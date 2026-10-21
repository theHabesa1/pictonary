// 🃏 Color Clash: an UNO-style shedding game. Match the top card's color or value, use action
// cards, call "LAST CARD!" when you're down to one — and be first to empty your hand.
//
// Every move is also recorded as an event ({ id, type, … }) so clients can animate it:
// dealing, cards flying to the pile, cards drawn from the deck, skips, reverses…
import { CARD_COLORS, canPlayCard, cardPoints } from '../shared/constants.js';

const REVEAL_TIME = 12; // seconds the round result is shown
const AWAY_TURN_TIME = 6; // a disconnected player's turn times out quickly
const MAX_EVENTS = 60;

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** The standard 108-card deck. */
function buildDeck() {
  const deck = [];
  let n = 0;
  const add = (color, value) => deck.push({ id: `k${n++}`, color, value });
  for (const color of CARD_COLORS) {
    add(color, '0');
    for (let v = 1; v <= 9; v++) {
      add(color, String(v));
      add(color, String(v));
    }
    for (const action of ['skip', 'reverse', 'draw2']) {
      add(color, action);
      add(color, action);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('wild', 'wild');
    add('wild', 'wild4');
  }
  return shuffle(deck);
}

export class CardGame {
  constructor(room) {
    this.kind = 'cards';
    this.room = room;
    this.round = 0;
    this.events = [];
    this.eventId = 0;
    this.phase = null;
  }

  get settings() {
    return this.room.settings;
  }

  start() {
    this.round = 0;
    this.nextRound();
  }

  event(e) {
    this.events.push({ id: ++this.eventId, ...e });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  // ───────────────────────── round flow ─────────────────────────

  nextRound() {
    const room = this.room;
    const online = room.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt);
    if (online.length < 2) return room.endGame('Color Clash needs at least 2 players.');
    this.round++;
    if (this.round > this.settings.rounds) return room.endGame();

    this.deck = buildDeck();
    this.discard = [];
    this.order = online.map((p) => p.id); // seats, in join order
    this.hands = new Map(this.order.map((id) => [id, []]));
    for (let i = 0; i < this.settings.handSize; i++) {
      for (const id of this.order) this.hands.get(id).push(this.deck.pop());
    }
    // Start the pile with a plain number card.
    let top = this.deck.pop();
    while (!/^\d$/.test(top.value)) {
      this.deck.unshift(top);
      top = this.deck.pop();
    }
    this.discard.push(top);
    this.color = top.color;
    this.dir = 1;
    this.turnIdx = (this.round - 1) % this.order.length; // a different starter each round
    this.pending = 0; // stacked +2/+4 waiting to be drawn
    this.drawn = null; // card the current player just drew (they may play only that one)
    this.called = new Set(); // players who called "LAST CARD!"
    this.catchable = new Map(); // pid -> move number when they hit one card without calling
    this.moves = 0;
    this.reveal = null;
    room.phase = 'cards';
    this.event({ type: 'deal', order: this.order, count: this.settings.handSize, top });
    room.system(`🃏 Round ${this.round} of ${this.settings.rounds} — cards are dealt!`);
    this.startTurn();
  }

  current() {
    return this.order[this.turnIdx];
  }

  step(n = 1) {
    const len = this.order.length;
    this.turnIdx = (((this.turnIdx + this.dir * n) % len) + len) % len;
  }

  top() {
    return this.discard[this.discard.length - 1];
  }

  startTurn() {
    const room = this.room;
    // Skip seats of players who left the room.
    for (let i = 0; i < this.order.length && !room.players.has(this.current()); i++) this.step();
    this.drawn = null;
    const p = room.players.get(this.current());
    const secs = p?.connected ? this.settings.turnTime : AWAY_TURN_TIME;
    this.endsAt = Date.now() + secs * 1000;
    this.duration = secs;
    room.broadcast();
  }

  /** A new move (play/draw) closes everyone else's "catch me" window. */
  newMove() {
    this.moves++;
    for (const [id, m] of this.catchable) if (m < this.moves - 1) this.catchable.delete(id);
  }

  /** Take n cards off the deck, reshuffling the pile into it when it runs out. */
  take(n) {
    const out = [];
    while (out.length < n) {
      if (!this.deck.length) {
        if (this.discard.length <= 1) break;
        const top = this.discard.pop();
        this.deck = shuffle(this.discard);
        this.discard = [top];
        this.event({ type: 'reshuffle' });
      }
      out.push(this.deck.pop());
    }
    return out;
  }

  giveCards(pid, n, reason) {
    const cards = this.take(n);
    this.hands.get(pid)?.push(...cards);
    this.called.delete(pid);
    this.catchable.delete(pid);
    this.event({ type: 'draw', pid, count: cards.length, cards, reason });
    return cards;
  }

  // ───────────────────────── player actions ─────────────────────────

  play(pid, cardId, chosenColor) {
    const room = this.room;
    if (room.phase !== 'cards' || pid !== this.current()) return;
    const hand = this.hands.get(pid);
    const idx = hand?.findIndex((c) => c.id === cardId) ?? -1;
    if (idx < 0) return;
    const card = hand[idx];
    if (this.drawn && this.drawn !== cardId) return room.whisper(pid, 'You can only play the card you just drew (or pass).');
    if (!canPlayCard(card, this.top(), this.color, this.pending, this.settings.stacking)) {
      return room.whisper(pid, this.pending ? `Play a ${this.top().value === 'draw2' ? '+2' : '+4'} or draw ${this.pending}!` : "That card doesn't match.");
    }
    if (card.color === 'wild' && !CARD_COLORS.includes(chosenColor)) return;

    this.newMove();
    hand.splice(idx, 1);
    this.discard.push(card);
    this.color = card.color === 'wild' ? chosenColor : card.color;
    this.event({ type: 'play', pid, card, color: this.color });
    if (hand.length === 1 && !this.called.has(pid)) this.catchable.set(pid, this.moves);
    if (hand.length !== 1) this.called.delete(pid);
    if (!hand.length) return this.roundWon(pid);

    const p = room.players.get(pid);
    switch (card.value) {
      case 'skip':
        this.step();
        this.event({ type: 'skip', pid: this.current() });
        this.step();
        break;
      case 'reverse':
        this.dir *= -1;
        this.event({ type: 'reverse', dir: this.dir });
        // With two players a reverse works like a skip.
        if (this.order.length === 2) {
          this.step();
          this.event({ type: 'skip', pid: this.current() });
        }
        this.step();
        break;
      case 'draw2':
      case 'wild4': {
        this.pending += card.value === 'draw2' ? 2 : 4;
        this.step();
        if (!this.settings.stacking) {
          // No stacking: the next player draws right away and loses their turn.
          this.giveCards(this.current(), this.pending, card.value);
          this.pending = 0;
          this.event({ type: 'skip', pid: this.current() });
          this.step();
        }
        break;
      }
      default:
        this.step();
    }
    if (card.color === 'wild') room.system(`🌈 ${p?.name} picked ${this.color.toUpperCase()}`);
    this.startTurn();
  }

  draw(pid) {
    const room = this.room;
    if (room.phase !== 'cards' || pid !== this.current()) return;
    if (this.pending > 0) {
      // Stacked +2/+4 lands on you: draw them all, turn over.
      this.newMove();
      this.giveCards(pid, this.pending, 'stack');
      this.pending = 0;
      this.step();
      return this.startTurn();
    }
    if (this.drawn) return; // already drew: play that card or pass
    this.newMove();
    const [card] = this.giveCards(pid, 1, 'draw');
    if (!card || !canPlayCard(card, this.top(), this.color)) {
      // Nothing playable: the turn passes automatically.
      this.step();
      return this.startTurn();
    }
    this.drawn = card.id;
    room.broadcast();
  }

  pass(pid) {
    if (this.room.phase !== 'cards' || pid !== this.current() || !this.drawn) return;
    this.step();
    this.startTurn();
  }

  callLastCard(pid) {
    const room = this.room;
    const hand = this.hands.get(pid);
    if (room.phase !== 'cards' || !hand || this.called.has(pid)) return;
    // Call it with one card left, or just before playing your second-to-last card.
    if (hand.length === 1 || (hand.length === 2 && pid === this.current())) {
      this.called.add(pid);
      this.catchable.delete(pid);
      this.event({ type: 'call', pid });
      room.system(`📣 ${room.players.get(pid)?.name}: LAST CARD!`, 'power');
      room.broadcast();
    }
  }

  catchPlayer(pid, targetId) {
    const room = this.room;
    if (room.phase !== 'cards' || pid === targetId || !this.catchable.has(targetId)) return;
    if (this.hands.get(targetId)?.length !== 1) return;
    this.catchable.delete(targetId);
    this.event({ type: 'catch', pid, target: targetId });
    this.giveCards(targetId, 2, 'caught');
    const a = room.players.get(pid)?.name;
    const b = room.players.get(targetId)?.name;
    room.system(`🚨 ${a} caught ${b} forgetting to call LAST CARD! +2 cards`, 'power');
    room.broadcast();
  }

  roundWon(pid) {
    const room = this.room;
    let pts = 0;
    const hands = {};
    for (const [id, hand] of this.hands) {
      if (id !== pid) pts += hand.reduce((sum, c) => sum + cardPoints(c), 0);
      hands[id] = hand;
    }
    const winner = room.players.get(pid);
    if (winner) winner.score += pts;
    if (winner) winner.correct++;
    this.event({ type: 'win', pid, pts });
    room.system(`🏆 ${winner?.name} emptied their hand and wins the round! +${pts}`, 'correct');
    this.reveal = { winner: pid, pts, hands };
    room.phase = 'cardsReveal';
    this.endsAt = Date.now() + REVEAL_TIME * 1000;
    this.duration = REVEAL_TIME;
    room.broadcast();
  }

  tick(now) {
    const room = this.room;
    if (now < this.endsAt) return;
    if (room.phase === 'cards') {
      // Out of time: take any stacked cards, or draw one, and the turn moves on.
      const pid = this.current();
      this.newMove();
      if (this.pending > 0) {
        this.giveCards(pid, this.pending, 'stack');
        this.pending = 0;
      } else if (!this.drawn) {
        this.giveCards(pid, 1, 'timeout');
      }
      const p = room.players.get(pid);
      if (p?.connected) room.whisper(pid, "⏰ Time's up — your turn was skipped.");
      this.step();
      this.startTurn();
    } else if (room.phase === 'cardsReveal' && room.connectedPlayers().length >= 2) {
      this.nextRound();
    }
  }

  onPlayerGone(p, left) {
    if (!left || !this.hands?.has(p.id) || this.room.phase !== 'cards') return;
    // Their cards go back under the deck and their seat is removed.
    this.deck.unshift(...this.hands.get(p.id));
    this.hands.delete(p.id);
    const seat = this.order.indexOf(p.id);
    const wasCurrent = seat === this.turnIdx;
    this.order.splice(seat, 1);
    this.called.delete(p.id);
    this.catchable.delete(p.id);
    const len = this.order.length;
    if (len < 2) return this.roundWon(this.order[0]);
    if (wasCurrent) {
      // The turn passes to whoever was next in the current direction.
      this.turnIdx = this.dir === 1 ? seat % len : (seat - 1 + len) % len;
      this.startTurn();
    } else {
      if (seat < this.turnIdx) this.turnIdx--;
      this.room.broadcast();
    }
  }

  snapshot(me) {
    if (!this.order) return { round: this.round, rounds: this.settings.rounds };
    const mine = this.hands.get(me.id) ?? [];
    const revealed = this.room.phase === 'cardsReveal';
    return {
      round: this.round,
      rounds: this.settings.rounds,
      order: this.order,
      current: this.room.phase === 'cards' ? this.current() : null,
      dir: this.dir,
      color: this.color,
      pile: this.discard.slice(-5), // top of the pile is last
      deckCount: this.deck.length,
      hand: mine,
      counts: Object.fromEntries([...this.hands].map(([id, h]) => [id, h.length])),
      pending: this.pending,
      stacking: this.settings.stacking,
      drawn: this.current() === me.id ? this.drawn : null,
      called: [...this.called],
      catchable: [...this.catchable.keys()],
      endsAt: this.endsAt,
      duration: this.duration,
      // Recent moves for animations. Only you see which cards you drew.
      events: this.events.map((e) => (e.type === 'draw' && e.pid !== me.id ? { ...e, cards: undefined } : e)),
      reveal: revealed ? this.reveal : null,
    };
  }
}
