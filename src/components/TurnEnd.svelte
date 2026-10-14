<script>
  import { TEAMS } from '../../shared/constants.js';

  let { state: s, reveal, drawer } = $props();

  const nameOf = (id) => s.players.find((p) => p.id === id);
  const headline = $derived.by(() => {
    switch (reveal.reason) {
      case 'all_guessed':
        return '✨ Everyone got it!';
      case 'guessed':
        return `🎉 ${reveal.by?.name} got it for the ${TEAMS[reveal.by?.team]?.name}!`;
      case 'stolen':
        return `🦝 Stolen by ${reveal.by?.name}!`;
      case 'drawer_left':
        return '👋 The drawer left';
      case 'skipped':
        return '⏭️ Turn skipped';
      default:
        return reveal.gains.length ? "⏰ Time's up!" : "⏰ Time's up — nobody got it!";
    }
  });
</script>

<div class="overlay">
  <h3>{headline}</h3>
  {#if reveal.word}
    <p class="was">The word was</p>
    <div class="word">{reveal.word}</div>
  {/if}
  {#if reveal.gains.length}
    <ul class="gains">
      {#each reveal.gains as g, i (g.id)}
        {@const p = nameOf(g.id)}
        {#if p}
          <li style:animation-delay="{0.15 + i * 0.06}s">
            <span>{p.avatar} {p.name}{p.id === drawer?.id ? ' ✏️' : ''}</span>
            <b>+{g.pts}</b>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    text-align: center;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(4px);
    animation: fade 0.3s ease;
  }
  h3 {
    font-size: clamp(1.2rem, 3vw, 1.7rem);
  }
  .was {
    margin: 4px 0 0;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .word {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(2rem, 6vw, 3.4rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--violet);
    -webkit-text-stroke: 2px var(--ink);
    paint-order: stroke fill;
    text-shadow: 0 4px 0 var(--ink);
    animation: pop-in 0.5s ease;
  }
  .gains {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: min(300px, 90%);
    max-height: 45%;
    overflow-y: auto;
  }
  .gains li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 12px;
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 12px;
    font-weight: 800;
    animation: pop-in 0.35s ease backwards;
  }
  .gains b {
    color: #15803d;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* Small boards (phones): the board is a size container. */
  @container (max-height: 360px) {
    .overlay {
      gap: 4px;
      padding: 10px;
    }
    h3 {
      font-size: 1rem;
    }
    .was {
      font-size: 0.7rem;
      margin: 0;
    }
    .word {
      font-size: 1.9rem;
      -webkit-text-stroke-width: 1.5px;
      text-shadow: 0 3px 0 var(--ink);
    }
    .gains {
      margin-top: 4px;
      gap: 3px;
      max-height: 40%;
    }
    .gains li {
      padding: 2px 10px;
      font-size: 0.85rem;
      border-radius: 9px;
    }
  }
</style>
