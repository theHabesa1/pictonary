<script>
  // One Color Clash card (face or back), drawn entirely with CSS/SVG.
  import { CARD_HEX } from '../../../shared/constants.js';

  let { card = null, back = false, w = 80 } = $props();

  const hex = $derived(card ? CARD_HEX[card.color] : CARD_HEX.wild);
  const value = $derived(card?.value);
  const isWild = $derived(value === 'wild' || value === 'wild4');
  const text = $derived(/^\d$/.test(value ?? '') ? value : value === 'draw2' ? '+2' : value === 'wild4' ? '+4' : '');
</script>

{#snippet symbol(big)}
  {#if value === 'skip'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="3" />
      <line x1="6.4" y1="17.6" x2="17.6" y2="6.4" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  {:else if value === 'reverse'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <path d="M5 9.5h11.5l-3.4-3.4M19 14.5H7.5l3.4 3.4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {:else if value === 'wild' && !big}
    <span class="mini-wheel"></span>
  {:else}
    <span class="txt">{text}</span>
  {/if}
{/snippet}

<div class="pc" class:back={back || !card} style:--w="{w}px" style:--c={hex} aria-label={card && !back ? `${card.color} ${value}` : 'card'}>
  {#if back || !card}
    <div class="panel back-panel">
      <div class="ring">
        <span class="dots"><i class="r"></i><i class="y"></i><i class="g"></i><i class="b"></i></span>
        <b>COLOR</b>
        <b>CLASH</b>
      </div>
    </div>
  {:else}
    <div class="panel" class:wild={isWild}>
      <span class="corner tl">{@render symbol(false)}</span>
      <div class="badge" class:wheel={isWild}>
        {#if !(value === 'wild')}<span class="big">{@render symbol(true)}</span>{/if}
      </div>
      <span class="corner br">{@render symbol(false)}</span>
    </div>
  {/if}
</div>

<style>
  .pc {
    --h: calc(var(--w) * 1.5);
    width: var(--w);
    height: var(--h);
    border-radius: calc(var(--w) * 0.11);
    background: #fff;
    padding: calc(var(--w) * 0.055);
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.08),
      0 calc(var(--w) * 0.03) calc(var(--w) * 0.08) rgba(0, 0, 0, 0.35);
    user-select: none;
    flex: none;
    font-family: var(--font-display);
  }
  .panel {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: calc(var(--w) * 0.075);
    background: var(--c);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  /* Glossy sheen, like a real laminated card. */
  .panel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0) 38%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.12) 100%);
    pointer-events: none;
  }
  .badge {
    width: 72%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff;
    display: grid;
    place-items: center;
    box-shadow: inset 0 calc(var(--w) * -0.03) 0 rgba(0, 0, 0, 0.12);
    color: var(--c);
  }
  .badge.wheel {
    background: conic-gradient(#e5383b 0 25%, #f6b800 0 50%, #2ca54a 0 75%, #1f7ae0 0);
    border: calc(var(--w) * 0.04) solid #fff;
    color: #fff;
  }
  .big {
    display: grid;
    place-items: center;
    font-size: calc(var(--w) * 0.46);
    font-weight: 700;
    line-height: 1;
    -webkit-text-stroke: calc(var(--w) * 0.018) #1d1442;
    paint-order: stroke fill;
    text-shadow: calc(var(--w) * 0.025) calc(var(--w) * 0.025) 0 #1d1442;
  }
  .wheel .big {
    font-size: calc(var(--w) * 0.36);
  }
  .big .icon {
    width: calc(var(--w) * 0.5);
    height: calc(var(--w) * 0.5);
    filter: drop-shadow(calc(var(--w) * 0.02) calc(var(--w) * 0.02) 0 #1d1442);
  }
  .corner {
    position: absolute;
    color: #fff;
    font-size: calc(var(--w) * 0.2);
    font-weight: 700;
    line-height: 1;
    -webkit-text-stroke: calc(var(--w) * 0.012) #1d1442;
    paint-order: stroke fill;
    display: grid;
    place-items: center;
  }
  .corner .icon {
    width: calc(var(--w) * 0.22);
    height: calc(var(--w) * 0.22);
    filter: drop-shadow(0 0 calc(var(--w) * 0.01) #1d1442);
  }
  .tl {
    top: 6%;
    left: 8%;
  }
  .br {
    bottom: 6%;
    right: 8%;
    transform: rotate(180deg);
  }
  .mini-wheel {
    display: block;
    width: calc(var(--w) * 0.18);
    height: calc(var(--w) * 0.18);
    border-radius: 50%;
    border: calc(var(--w) * 0.015) solid #fff;
    background: conic-gradient(#e5383b 0 25%, #f6b800 0 50%, #2ca54a 0 75%, #1f7ae0 0);
  }
  /* ── back ── */
  .back-panel {
    background: #1d1442;
  }
  .back-panel::before {
    content: '';
    position: absolute;
    inset: 7%;
    border-radius: calc(var(--w) * 0.06);
    border: calc(var(--w) * 0.018) solid rgba(255, 255, 255, 0.25);
  }
  .ring {
    width: 78%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff;
    transform: rotate(-12deg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 0.95;
    color: #1d1442;
    box-shadow: inset 0 0 0 calc(var(--w) * 0.04) #ffd23f;
  }
  .ring b {
    font-size: calc(var(--w) * 0.15);
    letter-spacing: 0.02em;
  }
  .dots {
    display: flex;
    gap: calc(var(--w) * 0.025);
    margin-bottom: calc(var(--w) * 0.03);
  }
  .dots i {
    width: calc(var(--w) * 0.07);
    height: calc(var(--w) * 0.07);
    border-radius: 50%;
  }
  .dots .r {
    background: #e5383b;
  }
  .dots .y {
    background: #f6b800;
  }
  .dots .g {
    background: #2ca54a;
  }
  .dots .b {
    background: #1f7ae0;
  }
</style>
