<script>
  import { onMount } from 'svelte';
  import { CARD_COLORS, CARD_HEX, canPlayCard, cardPoints } from '../../shared/constants.js';
  import { openAccount } from '../lib/account.svelte.js';
  import { openGuide } from '../lib/guide.svelte.js';
  import { flyCard, pileOffset, pileTilt, rectOf, setLayer } from '../lib/cardfx.js';
  import { game, leaveRoom, send, stateHooks, toggleMute } from '../lib/game.svelte.js';
  import { sfx } from '../lib/sound.js';
  import Chat from './Chat.svelte';
  import GameOver from './GameOver.svelte';
  import Timer from './Timer.svelte';
  import PlayingCard from './cards/PlayingCard.svelte';

  const s = $derived(game.state);
  const c = $derived(s.clash);
  const me = $derived(s.me);
  const isHost = $derived(s.hostId === s.me);
  const playerOf = (id) => s.players.find((p) => p.id === id);
  const myTurn = $derived(s.phase === 'cards' && c?.current === me);
  const top = $derived(c?.pile?.at(-1));
  const seconds = $derived(c?.endsAt ? Math.max(0, Math.ceil((c.endsAt - game.now) / 1000)) : 0);
  const currentName = $derived(playerOf(c?.current)?.name ?? '');

  // ── layout ──
  let innerWidth = $state(1200);
  let innerHeight = $state(800);
  const phone = $derived(innerWidth <= 760);
  // Cards scale with the screen so the table and your hand always fit.
  const short = $derived(!phone && innerHeight < 700);
  const cardW = $derived(phone ? 60 : innerHeight >= 860 ? 92 : innerHeight >= 700 ? 80 : 62);
  const pileW = $derived(phone ? 64 : innerHeight >= 860 ? 96 : innerHeight >= 700 ? 84 : 66);
  let handW = $state(600);

  // Opponents, in turn order starting with the player after you.
  const seats = $derived.by(() => {
    if (!c?.order) return [];
    const i = c.order.indexOf(me);
    const rot = i >= 0 ? [...c.order.slice(i + 1), ...c.order.slice(0, i)] : c.order;
    return rot.map((id) => ({ id, p: playerOf(id), count: c.counts?.[id] ?? 0 }));
  });
  /** Seats sit around the top of the table, from left to right. */
  function seatPos(k, n) {
    const a = Math.PI * (n === 1 ? 0.5 : 0.94 - (0.88 * k) / (n - 1));
    return { x: 50 + 42 * Math.cos(a), y: 52 - 38 * Math.sin(a) };
  }

  // Your hand, sorted by color then value, fanned in a gentle arc.
  const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
  const valueOrder = (v) => (/^\d$/.test(v) ? Number(v) : { skip: 10, reverse: 11, draw2: 12, wild: 13, wild4: 14 }[v]);
  const hand = $derived(
    [...(c?.hand ?? [])].sort((a, b) => COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || valueOrder(a.value) - valueOrder(b.value)),
  );
  const fan = $derived.by(() => {
    const n = hand.length;
    const avail = Math.max(cardW, handW - 12);
    const step = n > 1 ? Math.min(cardW * 0.7, (avail - cardW) / (n - 1)) : 0;
    const start = (handW - (cardW + step * (n - 1))) / 2;
    const spread = Math.min(3.4, 36 / Math.max(1, n));
    return hand.map((card, i) => {
      const off = i - (n - 1) / 2;
      return { card, x: start + i * step, y: off * off * (phone ? 0.45 : 0.8), rot: off * spread };
    });
  });
  const rotOf = (id) => fan.find((f) => f.card.id === id)?.rot ?? 0;

  const playable = (card) =>
    myTurn && (!c.drawn || c.drawn === card.id) && canPlayCard(card, top, c.color, c.pending, c.stacking);
  const canDraw = $derived(myTurn && (c.pending > 0 || !c.drawn));
  const called = $derived(c?.called?.includes(me));
  const canCall = $derived(
    s.phase === 'cards' && !called && (hand.length === 1 || (hand.length === 2 && myTurn && hand.some(playable))),
  );

  // ── actions ──
  let pickingFor = $state(null); // wild card waiting for a color
  let shake = $state(null);
  function tryPlay(card) {
    if (!playable(card)) {
      shake = card.id;
      setTimeout(() => shake === card.id && (shake = null), 400);
      return;
    }
    if (card.color === 'wild') pickingFor = card;
    else send('cards:play', { id: card.id });
  }
  function pickColor(color) {
    send('cards:play', { id: pickingFor.id, color });
    pickingFor = null;
  }
  $effect(() => {
    if (!myTurn) pickingFor = null;
  });

  // ── animations ──
  let layerEl;
  let hiddenHand = $state(new Set());
  let hiddenPile = $state(new Set());
  const hide = (set, ids) => new Set([...set, ...ids]);
  const unhide = (set, id) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };
  let bursts = $state([]);
  let burstId = 0;
  function burst(rect, text, kind = '') {
    if (!rect) return;
    const id = ++burstId;
    bursts = [...bursts, { id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text, kind }];
    setTimeout(() => (bursts = bursts.filter((b) => b.id !== id)), 1500);
  }
  let spinKick = $state(0);
  let deckShake = $state(false);
  let confetti = $state(0);

  const deckRect = () => rectOf('[data-deck]');
  const pileRect = () => rectOf('[data-pile-top]');
  const seatRect = (pid) => rectOf(`[data-seat="${pid}"] .fan`) ?? rectOf(`[data-seat="${pid}"]`);
  const handRect = (id) => rectOf(`[data-hand-card="${id}"]`);
  const placeRect = (pid) => (pid === me ? rectOf('[data-me] .hand') : seatRect(pid));

  let captured = { hand: {}, rot: {} };
  let lastId = null;

  function animate(e, t) {
    switch (e.type) {
      case 'deal': {
        const mine = hand.map((h) => h.id);
        hiddenHand = hide(hiddenHand, mine);
        hiddenPile = hide(hiddenPile, [e.top.id]);
        setTimeout(() => sfx('shuffle'), t);
        let k = 0;
        for (let i = 0; i < e.count; i++) {
          for (const pid of e.order) {
            const delay = t + 350 + k++ * 55;
            if (pid === me) {
              const card = hand[i];
              if (!card) continue;
              flyCard({ card, from: deckRect(), to: handRect(card.id), flip: 'up', delay, duration: 430, toRotate: rotOf(card.id), onStart: () => sfx('deal'), onLand: () => (hiddenHand = unhide(hiddenHand, card.id)) });
            } else {
              flyCard({ card: null, from: deckRect(), to: seatRect(pid), flip: 'down', delay, duration: 430, onStart: () => sfx('deal') });
            }
          }
        }
        const end = t + 350 + k * 55 + 250;
        flyCard({ card: e.top, from: deckRect(), to: pileRect(), flip: 'up', delay: end, duration: 520, toRotate: pileTilt(e.top.id), onStart: () => sfx('card'), onLand: () => (hiddenPile = unhide(hiddenPile, e.top.id)) });
        return end + 450;
      }
      case 'play': {
        const mine = e.pid === me;
        const from = mine ? (captured.hand[e.card.id] ?? placeRect(me)) : seatRect(e.pid);
        hiddenPile = hide(hiddenPile, [e.card.id]);
        flyCard({
          card: e.card,
          from,
          to: pileRect(),
          flip: mine ? 'none' : 'up',
          delay: t,
          duration: 480,
          fromRotate: mine ? (captured.rot[e.card.id] ?? 0) : 0,
          toRotate: pileTilt(e.card.id),
          onStart: () => sfx('card'),
          onLand: () => {
            hiddenPile = unhide(hiddenPile, e.card.id);
            if (e.card.color === 'wild') burst(pileRect(), `🎨 ${e.color.toUpperCase()}`, `wild ${e.color}`);
          },
        });
        return t + 380;
      }
      case 'draw': {
        const mine = e.pid === me && e.cards;
        if (mine) hiddenHand = hide(hiddenHand, e.cards.map((x) => x.id));
        for (let k = 0; k < e.count; k++) {
          const card = mine ? e.cards[k] : null;
          const delay = t + k * 140;
          flyCard({
            card,
            from: deckRect(),
            to: card ? handRect(card.id) : seatRect(e.pid),
            flip: card ? 'up' : 'down',
            delay,
            duration: 520,
            toRotate: card ? rotOf(card.id) : 0,
            onStart: () => sfx('draw'),
            onLand: () => card && (hiddenHand = unhide(hiddenHand, card.id)),
          });
        }
        if (['draw2', 'wild4', 'stack', 'caught'].includes(e.reason)) {
          setTimeout(() => burst(placeRect(e.pid), `+${e.count}`, 'plus'), t);
        }
        return t + e.count * 140 + 150;
      }
      case 'skip':
        setTimeout(() => burst(placeRect(e.pid), '⊘ Skipped!', 'skip'), t);
        return t + 200;
      case 'reverse':
        setTimeout(() => {
          spinKick++;
          sfx('whoosh');
          burst(rectOf('[data-dir]'), '⇄ Reverse!', 'reverse');
        }, t);
        return t + 250;
      case 'call':
        setTimeout(() => {
          sfx('lastCard');
          burst(placeRect(e.pid), '📣 LAST CARD!', 'call');
        }, t);
        return t + 150;
      case 'catch':
        setTimeout(() => burst(placeRect(e.target), '🚨 CAUGHT!', 'catch'), t);
        return t + 300;
      case 'reshuffle':
        setTimeout(() => {
          deckShake = true;
          sfx('shuffle');
          setTimeout(() => (deckShake = false), 700);
        }, t);
        return t + 500;
      case 'win':
        setTimeout(() => {
          confetti++;
          sfx('fanfare');
        }, t + 300);
        return t + 300;
      default:
        return t;
    }
  }

  function processEvents(cl) {
    const evs = cl?.events ?? [];
    if (!evs.length) return;
    if (lastId === null) {
      // First look at this game: animate a deal that just happened, skip older history.
      const d = evs.findLastIndex((e) => e.type === 'deal');
      lastId = d >= 0 && evs.length - d <= 2 ? evs[d].id - 1 : evs.at(-1).id;
    }
    const fresh = evs.filter((e) => e.id > lastId);
    if (!fresh.length) return;
    lastId = fresh.at(-1).id;
    if (fresh.length > 15 && !fresh.some((e) => e.type === 'deal')) return; // too far behind: just jump
    let t = 0;
    for (const e of fresh) t = animate(e, t);
  }

  const hook = {
    before(prev, next) {
      if (!next.clash) return;
      // Remember where your cards are before they move or disappear.
      captured = { hand: {}, rot: {} };
      for (const el of document.querySelectorAll('[data-hand-card]')) {
        captured.hand[el.dataset.handCard] = el.getBoundingClientRect();
        captured.rot[el.dataset.handCard] = rotOf(el.dataset.handCard);
      }
    },
    after(prev, next) {
      if (!next.clash) return;
      processEvents(next.clash);
      if (next.clash.current === me && prev?.clash?.current !== me && next.phase === 'cards') setTimeout(() => sfx('yourTurn'), 350);
    },
  };

  onMount(() => {
    setLayer(layerEl);
    stateHooks.add(hook);
    processEvents(c);
    return () => {
      stateHooks.delete(hook);
      setLayer(null);
    };
  });

  // ── misc UI ──
  let menuOpen = $state(false);
  const closeMenu = () => (menuOpen = false);
  let chatOpen = $state(false);
  let seenMessages = $state(game.messages.length);
  const unread = $derived(chatOpen || !phone ? 0 : Math.max(0, game.messages.length - seenMessages));
  $effect(() => {
    if (chatOpen) seenMessages = game.messages.length;
  });
  const handPoints = (cards) => cards.reduce((n, x) => n + cardPoints(x), 0);
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="cg" class:phone class:short>
  <header class="bar card">
    <div class="round" title="Round">
      <small>Round</small>
      <b>{c?.round ?? 1}<span>/{c?.rounds ?? s.settings.rounds}</span></b>
    </div>
    <div class="status">
      <span class="lbl">🃏 Color Clash</span>
      {#if s.phase === 'cards'}
        <b class:mine={myTurn}>{myTurn ? '⭐ Your turn!' : `${currentName}'s turn`}</b>
      {:else if s.phase === 'cardsReveal'}
        <b>🏆 Round over</b>
      {:else}
        <b>🏁 Game over</b>
      {/if}
    </div>
    <div class="bar-right">
      {#if s.phase === 'cards'}<Timer {seconds} total={c.duration} small={phone} />{/if}
      {#if phone}
        <button class="btn white icon chat-btn" onclick={() => (chatOpen = !chatOpen)} aria-label="Chat">
          💬{#if unread}<span class="badge">{unread}</span>{/if}
        </button>
      {/if}
      <div class="menu-wrap">
        <button class="btn white icon" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>☰</button>
        {#if menuOpen}
          <button class="scrim" aria-label="Close menu" onclick={closeMenu}></button>
          <div class="menu card" role="menu">
            <div class="room-code">Room <b>{s.code}</b></div>
            <button role="menuitem" onclick={() => { toggleMute(); closeMenu(); }}>{game.muted ? '🔊 Turn sounds on' : '🔇 Mute sounds'}</button>
            {#if isHost && s.phase !== 'gameOver'}
              <button role="menuitem" onclick={() => { if (confirm('End the game for everyone and go back to the lobby?')) send('game:lobby'); closeMenu(); }}>⏹️ End game</button>
            {/if}
            <button role="menuitem" onclick={() => { openGuide(s.settings.game); closeMenu(); }}>❓ How to play</button>
            <button role="menuitem" onclick={() => { openAccount(); closeMenu(); }}>⭐ My account</button>
            <button role="menuitem" onclick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}?r=${s.code}`); closeMenu(); }}>🔗 Copy invite link</button>
            <button role="menuitem" class="danger" onclick={() => confirm('Leave this game?') && leaveRoom()}>🚪 Leave room</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <main class="arena">
    {#if c?.order}
      <div class="table" style:--glow={CARD_HEX[c.color] ?? '#fff'}>
        <!-- Opponents -->
        <div class="seats" class:row={phone}>
          {#each seats as seat, k (seat.id)}
            {@const pos = seatPos(k, seats.length)}
            <div
              class="seat"
              data-seat={seat.id}
              class:turn={c.current === seat.id}
              class:away={!seat.p?.connected}
              style:left={phone ? null : `${pos.x}%`}
              style:top={phone ? null : `${pos.y}%`}
            >
              <div class="fan" style:--n={Math.min(seat.count, 7)}>
                {#each Array(Math.min(seat.count, 7)) as _, i}
                  <div class="mini" style:--i={i}><PlayingCard back w={phone ? 20 : 28} /></div>
                {/each}
              </div>
              <div class="who">
                <span class="av">{seat.p?.avatar ?? '👻'}</span>
                <span class="nm">{seat.p?.name ?? 'Left'}</span>
              </div>
              <div class="meta"><b>{seat.count}</b> card{seat.count === 1 ? '' : 's'} · {seat.p?.score ?? 0} pts</div>
              {#if c.called.includes(seat.id) && seat.count === 1}<div class="shout">LAST CARD!</div>{/if}
              {#if c.catchable.includes(seat.id) && s.phase === 'cards'}
                <button class="catch" onclick={() => send('cards:catch', seat.id)}>🚨 Catch!</button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Deck & pile -->
        <div class="center">
          <svg class="dir" data-dir class:ccw={c.dir === -1} viewBox="0 0 200 200" aria-label={c.dir === 1 ? 'Clockwise' : 'Counter-clockwise'}>
            {#key spinKick}
              <g class="dir-spin" class:kick={spinKick > 0}>
                <path d="M100 18 A82 82 0 0 1 182 100" />
                <path d="M100 182 A82 82 0 0 1 18 100" />
                <polygon points="182,100 172,84 192,84" transform="rotate(8 182 100)" />
                <polygon points="18,100 8,116 28,116" transform="rotate(8 18 100)" />
              </g>
            {/key}
          </svg>
          <button class="deck" data-deck class:can={canDraw} class:shake={deckShake} disabled={!canDraw} onclick={() => send('cards:draw')} aria-label="Draw a card">
            {#each [3, 2, 1, 0] as i}
              <div class="deck-card" style:--i={i}><PlayingCard back w={pileW} /></div>
            {/each}
            <span class="deck-count">{c.deckCount}</span>
            {#if canDraw}<span class="draw-hint">{c.pending ? `Draw ${c.pending}` : 'Draw'}</span>{/if}
          </button>
          <div class="pile" style:width="{pileW}px" style:height="{pileW * 1.5}px">
            <div class="glow-ring"></div>
            {#each c.pile as card, i (card.id)}
              {@const [ox, oy] = pileOffset(card.id)}
              <div class="pile-card" data-pile-top={i === c.pile.length - 1 ? '' : undefined} class:hidden={hiddenPile.has(card.id)} style:z-index={i}>
                <div style:transform="translate({ox}px, {oy}px) rotate({pileTilt(card.id)}deg)">
                  <PlayingCard {card} w={pileW} />
                </div>
              </div>
            {/each}
            <span class="color-chip" style:background={CARD_HEX[c.color]}>{c.color}</span>
          </div>
        </div>

        {#if c.pending > 0 && s.phase === 'cards'}
          <div class="pending">+{c.pending} {myTurn ? (c.stacking ? '— stack one or draw!' : '') : `for ${currentName}!`}</div>
        {/if}

        {#if s.phase === 'cardsReveal' && c.reveal}
          {@const w = playerOf(c.reveal.winner)}
          <div class="reveal">
            <div class="reveal-card card">
              <div class="trophy">🏆</div>
              <h2>{w?.avatar} {w?.name} wins the round!</h2>
              <p class="pts">+{c.reveal.pts} points from everyone's leftover cards</p>
              <div class="leftovers">
                {#each Object.entries(c.reveal.hands).filter(([id]) => id !== c.reveal.winner) as [id, cards]}
                  {@const p = playerOf(id)}
                  <div class="left-row">
                    <span class="nm">{p?.avatar} {p?.name}</span>
                    <span class="mini-hand">{#each cards.slice(0, 12) as x (x.id)}<PlayingCard card={x} w={24} />{/each}</span>
                    <b>{handPoints(cards)}</b>
                  </div>
                {/each}
              </div>
              <p class="next">{c.round >= c.rounds ? 'Final results' : 'Next round'} in {seconds}s…</p>
            </div>
          </div>
        {/if}

        {#key confetti}
          {#if confetti}
            <div class="confetti" aria-hidden="true">
              {#each Array(40) as _, i}<i style:--x="{(i * 37) % 100}%" style:--d="{(i % 7) * 0.08}s" style:--c={CARD_HEX[CARD_COLORS[i % 4]]}></i>{/each}
            </div>
          {/if}
        {/key}
      </div>

      <!-- You -->
      <section class="me-area" data-me class:turn={myTurn}>
        <div class="me-bar">
          <span class="me-who">{playerOf(me)?.avatar} <b>You</b> · {playerOf(me)?.score ?? 0} pts · {hand.length} card{hand.length === 1 ? '' : 's'}</span>
          <div class="actions">
            {#if myTurn && c.drawn}<button class="btn white small" onclick={() => send('cards:pass')}>✋ Keep it &amp; pass</button>{/if}
            {#if canCall}<button class="btn small last-btn" onclick={() => send('cards:last')}>📣 LAST CARD!</button>{/if}
            {#if called && hand.length === 1}<span class="called">✅ Called!</span>{/if}
          </div>
        </div>
        <div class="hand" bind:clientWidth={handW} style:height="{cardW * 1.5 + (phone || short ? 26 : 40)}px">
          {#each fan as slot (slot.card.id)}
            {@const ok = playable(slot.card)}
            <div class="slot" data-hand-card={slot.card.id} style:left="{slot.x}px" style:top="{slot.y + (phone ? 14 : 22)}px" style:width="{cardW}px" style:height="{cardW * 1.5}px">
              <button
                class="hand-card"
                class:playable={ok}
                class:dim={myTurn && !ok}
                class:hidden={hiddenHand.has(slot.card.id)}
                class:shake={shake === slot.card.id}
                style:--rot="{slot.rot}deg"
                onclick={() => tryPlay(slot.card)}
                aria-label="{slot.card.color} {slot.card.value}{ok ? ' (playable)' : ''}"
              >
                <PlayingCard card={slot.card} w={cardW} />
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </main>

  <aside class="chat card" class:open={chatOpen}>
    {#if phone}<button class="chat-close" onclick={() => (chatOpen = false)} aria-label="Close chat">✕</button>{/if}
    <Chat compact={phone} />
  </aside>

  {#if pickingFor}
    <div class="picker-wrap">
      <button class="scrim dark" aria-label="Cancel" onclick={() => (pickingFor = null)}></button>
      <div class="picker card" role="dialog" aria-label="Pick a color">
        <h3>🌈 Pick a color</h3>
        <div class="colors">
          {#each CARD_COLORS as col}
            <button style:--c={CARD_HEX[col]} onclick={() => pickColor(col)}>{col}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Flying cards and pop-up effects -->
  <div class="fx-layer" bind:this={layerEl}>
    {#each bursts as b (b.id)}
      <div class="burst {b.kind}" style:left="{b.x}px" style:top="{b.y}px">{b.text}</div>
    {/each}
  </div>

  {#if s.phase === 'gameOver'}
    <GameOver state={s} {isHost} />
  {/if}
</div>

<style>
  .cg {
    height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'bar bar'
      'arena chat';
    gap: 12px;
    padding: 12px;
    max-width: 1500px;
    margin: 0 auto;
    overflow: hidden;
  }
  .bar {
    grid-area: bar;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
  }
  .round {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--ink);
    color: #fff;
    border-radius: 12px;
    padding: 4px 12px;
    line-height: 1;
  }
  .round small {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.8;
  }
  .round b {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  .round b span {
    font-size: 0.9rem;
    opacity: 0.7;
  }
  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }
  .status .lbl {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .status b {
    font-family: var(--font-display);
    font-size: 1.35rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .status b.mine {
    color: #15803d;
    animation: pop-in 0.4s ease;
  }
  .bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .menu-wrap {
    position: relative;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    z-index: 40;
    cursor: default;
  }
  .scrim.dark {
    background: rgba(29, 20, 66, 0.5);
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 41;
    min-width: 220px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    animation: pop-in 0.18s ease;
  }
  .menu button {
    text-align: left;
    border: none;
    background: none;
    padding: 12px;
    border-radius: 10px;
    font-weight: 800;
  }
  .menu button:hover {
    background: #f1edff;
  }
  .menu .danger {
    color: #be123c;
  }
  .room-code {
    padding: 8px 12px;
    color: var(--muted);
    font-weight: 700;
    border-bottom: 2px solid var(--line);
    margin-bottom: 4px;
  }
  .room-code b {
    color: var(--ink);
    letter-spacing: 0.12em;
  }

  /* ───── table ───── */
  .arena {
    grid-area: arena;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .table {
    position: relative;
    flex: 1;
    min-height: 340px;
    border-radius: 36px;
    background: #1d7a4c;
    box-shadow:
      inset 0 0 70px rgba(0, 0, 0, 0.45),
      inset 0 0 0 3px rgba(255, 255, 255, 0.06),
      0 0 0 10px #8a5a2e,
      0 0 0 13px #5b3a1b,
      0 8px 0 13px #3e2711;
    margin: 13px 13px 10px;
    overflow: visible;
  }
  .seat {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 10px 8px;
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.22);
    color: #fff;
    min-width: 92px;
    transition: box-shadow 0.3s, background 0.3s;
  }
  .seat.turn {
    background: rgba(255, 210, 63, 0.25);
    box-shadow: 0 0 0 3px #ffd23f, 0 0 24px rgba(255, 210, 63, 0.6);
  }
  .seat.away {
    opacity: 0.55;
  }
  .fan {
    position: relative;
    width: calc(28px + (var(--n) - 1) * 9px);
    min-width: 28px;
    height: 46px;
  }
  .mini {
    position: absolute;
    left: calc(var(--i) * 9px);
    top: 2px;
    transform: rotate(calc((var(--i) - (var(--n) - 1) / 2) * 7deg));
    transform-origin: 50% 120%;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 130px;
  }
  .who .av {
    font-size: 1.3rem;
  }
  .who .nm {
    font-weight: 800;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.72rem;
    font-weight: 700;
    opacity: 0.85;
  }
  .shout {
    position: absolute;
    top: -14px;
    right: -18px;
    background: #ffd23f;
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    border: 2px solid var(--ink);
    transform: rotate(8deg);
    animation: pop-in 0.3s ease;
  }
  .catch {
    position: absolute;
    bottom: -16px;
    border: 2px solid var(--ink);
    background: var(--red);
    color: #fff;
    font-weight: 900;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.8rem;
    box-shadow: 0 3px 0 var(--ink);
    animation: wiggle 0.5s ease-in-out infinite;
    z-index: 5;
  }
  .center {
    position: absolute;
    left: 50%;
    top: 58%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 44px;
  }
  .dir {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 330px;
    height: 330px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    overflow: visible;
  }
  .dir path {
    fill: none;
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .dir polygon {
    fill: rgba(255, 255, 255, 0.18);
  }
  .dir-spin {
    transform-origin: 100px 100px;
    animation: dir-spin 14s linear infinite;
  }
  .ccw .dir-spin {
    animation-direction: reverse;
    transform: scaleX(-1);
  }
  .dir-spin.kick {
    animation:
      dir-kick 0.9s cubic-bezier(0.2, 0.9, 0.3, 1),
      dir-spin 14s linear 0.9s infinite;
  }
  .ccw .dir-spin.kick {
    animation-direction: normal, reverse;
  }
  @keyframes dir-spin {
    to {
      rotate: 360deg;
    }
  }
  @keyframes dir-kick {
    from {
      rotate: -200deg;
    }
  }
  .deck {
    position: relative;
    border: none;
    background: none;
    padding: 0;
    cursor: default;
  }
  .deck-card {
    position: absolute;
    left: calc(var(--i) * -1.5px);
    top: calc(var(--i) * -2px);
  }
  .deck-card:first-child {
    position: relative;
  }
  .deck.can {
    cursor: pointer;
  }
  .deck.can .deck-card:last-of-type {
    animation: deck-bob 1.2s ease-in-out infinite;
  }
  .deck.can:hover .deck-card:last-of-type {
    transform: translateY(-8px) rotate(-3deg);
  }
  .deck.shake {
    animation: wiggle 0.15s linear 4;
  }
  @keyframes deck-bob {
    50% {
      transform: translateY(-5px);
    }
  }
  .deck-count {
    position: absolute;
    bottom: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: #fff;
    border-radius: 999px;
    padding: 0 8px;
    font-weight: 800;
    font-size: 0.75rem;
    z-index: 5;
  }
  .draw-hint {
    position: absolute;
    top: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: #ffd23f;
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 1px 10px;
    font-weight: 900;
    font-size: 0.8rem;
    white-space: nowrap;
    z-index: 6;
    animation: bob 1s ease-in-out infinite;
  }
  .pile {
    position: relative;
  }
  .pile-card {
    position: absolute;
    inset: 0;
  }
  .pile-card.hidden {
    visibility: hidden;
  }
  .glow-ring {
    position: absolute;
    inset: -14px;
    border-radius: 18px;
    box-shadow: 0 0 0 4px var(--glow), 0 0 30px var(--glow);
    opacity: 0.85;
    transition: box-shadow 0.4s;
  }
  .color-chip {
    position: absolute;
    bottom: -30px;
    left: 50%;
    transform: translateX(-50%);
    color: #fff;
    font-weight: 900;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    padding: 1px 10px;
    border-radius: 999px;
    border: 2px solid #fff;
    z-index: 50;
  }
  .pending {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    background: var(--red);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    padding: 4px 16px;
    border-radius: 999px;
    border: 2px solid #fff;
    animation: pop-in 0.3s ease;
    white-space: nowrap;
  }

  /* ───── round reveal ───── */
  .reveal {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 36px;
    z-index: 30;
    animation: fade 0.3s ease;
    padding: 12px;
  }
  .reveal-card {
    padding: 18px 20px;
    text-align: center;
    max-width: 520px;
    width: 100%;
    animation: pop-in 0.4s ease;
  }
  .trophy {
    font-size: 3rem;
    animation: bob 1.2s ease-in-out infinite;
  }
  .reveal-card h2 {
    font-size: 1.5rem;
  }
  .pts {
    font-weight: 800;
    color: #15803d;
    margin: 4px 0 10px;
  }
  .leftovers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .left-row {
    display: grid;
    grid-template-columns: minmax(70px, 120px) 1fr auto;
    gap: 8px;
    align-items: center;
    text-align: left;
    font-weight: 800;
  }
  .left-row .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-hand {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }
  .next {
    margin: 10px 0 0;
    color: var(--muted);
    font-weight: 800;
  }
  .confetti {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    border-radius: 36px;
    z-index: 31;
  }
  .confetti i {
    position: absolute;
    top: -20px;
    left: var(--x);
    width: 10px;
    height: 14px;
    background: var(--c);
    border-radius: 2px;
    animation: fall 1.8s ease-in var(--d) forwards;
  }
  @keyframes fall {
    to {
      transform: translateY(560px) rotate(540deg);
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  /* ───── your hand ───── */
  .me-area {
    flex: none;
    border-radius: 18px;
    background: #fff;
    border: 3px solid var(--ink);
    box-shadow: var(--shadow-sm);
    padding: 8px 10px 2px;
    transition: box-shadow 0.3s, border-color 0.3s;
  }
  .me-area.turn {
    border-color: #f5b400;
    box-shadow: 0 0 0 3px #ffd23f, 0 3px 0 var(--ink);
  }
  .me-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    min-height: 34px;
  }
  .me-who {
    font-weight: 700;
  }
  .actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .last-btn {
    --bg: var(--yellow);
    animation: wiggle 0.6s ease-in-out infinite;
  }
  .called {
    font-weight: 800;
    color: #15803d;
  }
  .hand {
    position: relative;
    width: 100%;
  }
  .slot {
    position: absolute;
    transition:
      left 0.35s cubic-bezier(0.3, 0.7, 0.3, 1),
      top 0.35s cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  .hand-card {
    display: block;
    border: none;
    padding: 0;
    background: none;
    border-radius: 10px;
    transform: translateY(var(--lift, 0px)) rotate(var(--rot));
    transform-origin: 50% 100%;
    transition: transform 0.18s ease, filter 0.2s, opacity 0.2s;
    cursor: pointer;
  }
  .hand-card.playable {
    --lift: -14px;
    filter: drop-shadow(0 0 8px rgba(255, 210, 63, 0.95));
  }
  .hand-card.playable:hover,
  .hand-card.playable:focus-visible {
    --lift: -34px;
  }
  .hand-card.dim {
    filter: brightness(0.72) saturate(0.7);
    cursor: not-allowed;
  }
  .hand-card.hidden {
    visibility: hidden;
  }
  .hand-card.shake {
    animation: no 0.35s ease;
  }
  @keyframes no {
    25% {
      translate: -6px 0;
    }
    75% {
      translate: 6px 0;
    }
  }

  /* ───── chat ───── */
  .chat {
    grid-area: chat;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ───── color picker ───── */
  .picker-wrap {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
  }
  .picker-wrap .scrim {
    z-index: 0;
  }
  .picker {
    position: relative;
    z-index: 1;
    padding: 18px;
    text-align: center;
    animation: pop-in 0.25s ease;
  }
  .picker h3 {
    margin-bottom: 12px;
    font-size: 1.3rem;
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(2, 110px);
    gap: 10px;
  }
  .colors button {
    height: 80px;
    border-radius: 16px;
    border: 3px solid var(--ink);
    background: var(--c);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.1rem;
    text-transform: uppercase;
    -webkit-text-stroke: 1px var(--ink);
    paint-order: stroke fill;
    box-shadow: 0 4px 0 var(--ink);
    transition: transform 0.1s;
  }
  .colors button:hover {
    transform: translateY(-3px) scale(1.04);
  }

  /* ───── effects layer ───── */
  .fx-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 70;
  }
  .burst {
    position: fixed;
    transform: translate(-50%, -50%);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.6rem;
    color: #fff;
    -webkit-text-stroke: 2px var(--ink);
    paint-order: stroke fill;
    text-shadow: 0 3px 0 var(--ink);
    white-space: nowrap;
    animation: burst 1.5s ease forwards;
    z-index: 75;
  }
  .burst.plus {
    color: #ff5fa2;
    font-size: 2.2rem;
  }
  .burst.skip,
  .burst.catch {
    color: #ef4444;
  }
  .burst.call {
    color: #ffd23f;
  }
  .burst.wild.red {
    color: #e5383b;
  }
  .burst.wild.yellow {
    color: #f6b800;
  }
  .burst.wild.green {
    color: #2ca54a;
  }
  .burst.wild.blue {
    color: #1f7ae0;
  }
  @keyframes burst {
    0% {
      transform: translate(-50%, -50%) scale(0.3);
      opacity: 0;
    }
    18% {
      transform: translate(-50%, -60%) scale(1.15);
      opacity: 1;
    }
    75% {
      transform: translate(-50%, -85%) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -110%) scale(0.9);
      opacity: 0;
    }
  }

  @media (max-width: 1100px) {
    .cg {
      grid-template-columns: minmax(0, 1fr) 260px;
    }
  }

  /* ───── short screens (small laptops) ───── */
  .cg.short {
    gap: 8px;
    padding: 8px;
  }
  .short .bar {
    padding: 4px 10px;
  }
  .short .round b {
    font-size: 1.1rem;
  }
  .short .status b {
    font-size: 1.1rem;
  }
  .short .table {
    min-height: 220px;
    margin: 10px 10px 6px;
  }
  .short .seat {
    padding: 3px 8px 5px;
    min-width: 80px;
  }
  .short .fan {
    height: 34px;
  }
  .short .mini :global(.pc) {
    --w: 22px !important;
  }
  .short .who .av {
    font-size: 1rem;
  }
  .short .who .nm {
    font-size: 0.8rem;
  }
  .short .center {
    gap: 30px;
  }
  .short .dir {
    width: 240px;
    height: 240px;
  }
  .short .me-area {
    padding: 4px 8px 0;
  }
  .short .me-bar {
    min-height: 28px;
  }

  /* ───── phones ───── */
  .cg.phone {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
  }
  .phone .bar {
    padding: 5px 8px;
    gap: 8px;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
  .phone .round {
    padding: 5px 8px;
  }
  .phone .round small {
    display: none;
  }
  .phone .round b {
    font-size: 1.05rem;
  }
  .phone .status b {
    font-size: 1.05rem;
  }
  .phone .bar-right :global(.btn.icon) {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
  .phone .arena {
    flex: 1;
    gap: 6px;
  }
  .phone .table {
    margin: 9px 9px 6px;
    border-radius: 24px;
    min-height: 300px;
    box-shadow:
      inset 0 0 50px rgba(0, 0, 0, 0.45),
      0 0 0 6px #8a5a2e,
      0 0 0 8px #5b3a1b;
  }
  .seats.row {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 2px 18px;
  }
  .row .seat {
    position: relative;
    transform: none;
    min-width: 76px;
    padding: 4px 6px 6px;
    flex: none;
  }
  .row .fan {
    height: 32px;
  }
  .row .who .av {
    font-size: 1rem;
  }
  .row .who .nm {
    font-size: 0.75rem;
    max-width: 60px;
  }
  .phone .center {
    top: 60%;
    gap: 26px;
  }
  .phone .dir {
    width: 230px;
    height: 230px;
  }
  .phone .me-area {
    padding: 6px 6px 0;
    border-radius: 14px;
  }
  .phone .me-who {
    font-size: 0.85rem;
  }
  .phone .chat {
    position: fixed;
    left: 6px;
    right: 6px;
    bottom: 6px;
    height: 55dvh;
    z-index: 60;
    transform: translateY(110%);
    transition: transform 0.25s ease;
  }
  .phone .chat.open {
    transform: none;
  }
  .chat-close {
    position: absolute;
    top: 6px;
    right: 8px;
    z-index: 2;
    border: none;
    background: var(--line);
    border-radius: 8px;
    width: 30px;
    height: 30px;
    font-weight: 900;
  }
  .chat-btn {
    position: relative;
  }
  .chat-btn .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--red);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 900;
    border-radius: 999px;
    min-width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
  }
</style>
