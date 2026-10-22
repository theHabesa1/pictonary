<script>
  // The game picker on the home page: one big card per game, side by side on wide screens
  // and a swipeable slider on phones.
  import { GAMES, MAX_PLAYERS } from '../../shared/constants.js';
  import PlayingCard from './cards/PlayingCard.svelte';
  import { openGuide } from '../lib/guide.svelte.js';

  let { busy = false, onplay } = $props();

  const COPY = {
    pictionary: {
      tagline: 'Draw it, guess it, laugh about it.',
      chips: ['🎨 Drawing', '⏱️ 10–20 min'],
      features: ['Teams or every player for themselves', 'Letter hints as the clock runs down', 'Power-up cards to earn'],
    },
    cards: {
      tagline: 'The classic color-matching card game, with real animated cards.',
      chips: ['🃏 Cards', '⏱️ 10–15 min'],
      features: ['Skip, Reverse, +2 and Wild +4', 'Shout LAST CARD! (or get caught)', 'Optional stacking house rule'],
    },
    imposter: {
      tagline: 'Everyone knows the secret word, except one faker.',
      chips: ['🕵️ Bluffing', '⏱️ 5–10 min'],
      features: ['Secret roles every round', 'One-word clues, then a vote', "Caught? Guess the word to win"],
    },
  };
  // Pictonary and Color Clash first, side by side.
  const ORDER = ['pictionary', 'cards', 'imposter'];
  const slides = ORDER.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean);
  const players = (g) => `👥 ${g.minPlayers}–${g.maxPlayers ?? MAX_PLAYERS} players`;

  const FAN = [
    { color: 'red', value: '7' },
    { color: 'yellow', value: 'skip' },
    { color: 'blue', value: 'draw2' },
    { color: 'wild', value: 'wild4' },
  ].map((c, i) => ({ ...c, id: `fan${i}` }));

  let track;
  let active = $state(0);
  function onScroll() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    [...track.children].forEach((el, i) => {
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < Math.abs(track.children[best].offsetLeft + track.children[best].offsetWidth / 2 - mid)) best = i;
    });
    active = best;
  }
  function go(i) {
    const el = track?.children[Math.max(0, Math.min(slides.length - 1, i))];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
</script>

<div class="slider">
  <button class="arrow left" onclick={() => go(active - 1)} disabled={active === 0} aria-label="Previous game">‹</button>
  <div class="track" bind:this={track} onscroll={onScroll}>
    {#each slides as g (g.id)}
      {@const copy = COPY[g.id]}
      <article class="slide card {g.id}">
        <div class="art" aria-hidden="true">
          {#if g.id === 'pictionary'}
            <div class="canvas">
              <svg viewBox="0 0 200 130">
                <circle class="ink sun" cx="165" cy="28" r="14" />
                <path class="ink" d="M40 112 V66 L80 36 L120 66 V112 Z" />
                <path class="ink" d="M68 112 V86 H92 V112" />
                <path class="ink grass" d="M10 114 Q60 108 100 114 T190 113" />
                <path class="ink smoke" d="M100 46 V32 H110 V54" />
              </svg>
              <span class="pencil">✏️</span>
            </div>
            <div class="slots"><span></span><span>O</span><span></span><span>S</span><span></span></div>
          {:else if g.id === 'cards'}
            <div class="felt">
              {#each FAN as card, i (card.id)}
                <div class="fan-card" style:--i={i}><PlayingCard {card} w={64} /></div>
              {/each}
            </div>
          {:else}
            <div class="suspects">
              {#each ['🦊', '🐼', '🐸', '🐯'] as a, i}
                <span class="who" class:sus={i === 2} style:--i={i}>{a}{#if i === 2}<b class="spy">🕵️</b><b class="q">?</b>{/if}</span>
              {/each}
            </div>
            <div class="secret">The word is <b>🔒 ? ? ?</b></div>
          {/if}
        </div>
        <div class="info">
          <h3>{g.emoji} {g.name}</h3>
          <p class="tag">{copy.tagline}</p>
          <div class="chips">
            <span>{players(g)}</span>
            {#each copy.chips as c}<span>{c}</span>{/each}
          </div>
          <ul class="feat">
            {#each copy.features as f}<li>{f}</li>{/each}
          </ul>
          <button class="btn green wide play" disabled={busy} onclick={() => onplay?.(g.id)}>
            ✨ Create a {g.name} room
          </button>
          <button class="how" onclick={() => openGuide(g.id)}>❓ How to play</button>
        </div>
      </article>
    {/each}
  </div>
  <button class="arrow right" onclick={() => go(active + 1)} disabled={active === slides.length - 1} aria-label="Next game">›</button>
  <div class="dots" role="tablist" aria-label="Games">
    {#each slides as g, i (g.id)}
      <button class:on={active === i} onclick={() => go(i)} role="tab" aria-selected={active === i} aria-label={g.name}></button>
    {/each}
  </div>
</div>

<style>
  .slider {
    position: relative;
    width: 100%;
  }
  .track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(280px, 1fr);
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    padding: 6px 4px 14px;
    -webkit-overflow-scrolling: touch;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .slide {
    scroll-snap-align: center;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .slide:hover {
    transform: translateY(-4px);
    box-shadow: 0 9px 0 var(--ink);
  }
  .art {
    position: relative;
    height: 190px;
    display: grid;
    place-items: center;
    border-bottom: 3px solid var(--ink);
    overflow: hidden;
  }
  .info {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }
  h3 {
    font-size: 1.45rem;
  }
  .tag {
    margin: 0;
    font-weight: 700;
    color: var(--ink-soft);
    line-height: 1.35;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chips span {
    background: var(--cream);
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 2px 9px;
    font-weight: 800;
    font-size: 0.78rem;
  }
  .feat {
    margin: 0;
    padding-left: 18px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink-soft);
    line-height: 1.5;
    flex: 1;
  }
  .play {
    margin-top: 4px;
  }
  .how {
    border: none;
    background: none;
    color: var(--violet);
    font-weight: 800;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 2px;
  }
  .wide {
    width: 100%;
  }

  /* ── Pictonary art ── */
  .pictionary .art {
    background: #efeaff;
  }
  .canvas {
    position: relative;
    width: 210px;
    height: 136px;
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: 12px;
    transform: rotate(-3deg);
    box-shadow: var(--shadow-sm);
  }
  .canvas svg {
    width: 100%;
    height: 100%;
  }
  .ink {
    fill: none;
    stroke: var(--ink);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
    animation: draw 1.6s ease forwards;
  }
  .ink.sun {
    stroke: #f5b400;
    animation-delay: 1.2s;
  }
  .ink.grass {
    stroke: #22c55e;
    animation-delay: 0.9s;
  }
  .ink.smoke {
    animation-delay: 0.6s;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .pencil {
    position: absolute;
    right: -14px;
    bottom: -10px;
    font-size: 2rem;
    animation: wiggle 0.8s ease-in-out infinite;
  }
  .slots {
    position: absolute;
    bottom: 10px;
    display: flex;
    gap: 6px;
  }
  .slots span {
    width: 18px;
    height: 22px;
    border-bottom: 3px solid var(--ink);
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--violet);
    text-align: center;
  }

  /* ── Color Clash art ── */
  .cards .art {
    background: #1d7a4c;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.45);
    border-bottom-color: #5b3a1b;
    border-bottom-width: 6px;
  }
  .felt {
    position: relative;
    width: 200px;
    height: 120px;
    margin-top: 20px;
  }
  .fan-card {
    position: absolute;
    left: calc(50% - 32px);
    top: 0;
    transform-origin: 50% 120%;
    transform: rotate(calc((var(--i) - 1.5) * 13deg));
    transition: transform 0.35s cubic-bezier(0.3, 0.7, 0.3, 1.4);
  }
  .slide:hover .fan-card {
    transform: rotate(calc((var(--i) - 1.5) * 22deg)) translateY(-8px);
  }

  /* ── Imposter art ── */
  .imposter .art {
    background: #fff1f2;
  }
  .suspects {
    display: flex;
    gap: 10px;
    margin-bottom: 26px;
  }
  .who {
    position: relative;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid var(--ink);
    display: grid;
    place-items: center;
    font-size: 2rem;
    animation: bob 1.6s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.2s);
  }
  .who.sus {
    border-color: #be123c;
  }
  .spy {
    position: absolute;
    bottom: -10px;
    right: -8px;
    font-size: 1.3rem;
  }
  .q {
    position: absolute;
    top: -16px;
    right: -6px;
    background: #be123c;
    color: #fff;
    font-family: var(--font-display);
    font-size: 0.95rem;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    animation: wiggle 0.9s ease-in-out infinite;
  }
  .secret {
    position: absolute;
    bottom: 14px;
    font-weight: 800;
    color: var(--ink-soft);
  }
  .secret b {
    font-family: var(--font-display);
    letter-spacing: 0.1em;
    color: #be123c;
  }

  /* ── arrows & dots (only needed when the cards don't all fit) ── */
  .arrow {
    position: absolute;
    top: 95px;
    z-index: 2;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid var(--ink);
    background: #fff;
    font-size: 1.5rem;
    font-weight: 900;
    line-height: 1;
    box-shadow: var(--shadow-sm);
    display: none;
  }
  .arrow:disabled {
    opacity: 0;
    pointer-events: none;
  }
  .arrow.left {
    left: -6px;
  }
  .arrow.right {
    right: -6px;
  }
  .dots {
    display: none;
    justify-content: center;
    gap: 8px;
  }
  .dots button {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 2px solid var(--ink);
    background: #fff;
    padding: 0;
    transition: width 0.2s, background 0.2s;
  }
  .dots button.on {
    width: 26px;
    background: var(--ink);
  }
  @media (max-width: 960px) {
    .track {
      grid-auto-columns: min(340px, 82%);
    }
    .arrow {
      display: block;
    }
    .dots {
      display: flex;
    }
  }
  @media (max-width: 520px) {
    .track {
      grid-auto-columns: 86%;
      gap: 12px;
    }
    .art {
      height: 170px;
    }
    .arrow {
      display: none;
    }
  }
</style>
