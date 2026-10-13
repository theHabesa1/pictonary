<script>
  import { REACTIONS } from '../../shared/constants.js';
  import { game, send } from '../lib/game.svelte.js';

  // `buttons` renders the reaction picker; otherwise the floating emojis over the board.
  let { buttons = false } = $props();
</script>

{#if buttons}
  <div class="picker" aria-label="Send a reaction">
    {#each REACTIONS as r}
      <button onclick={() => send('react', r)} aria-label="React {r}">{r}</button>
    {/each}
  </div>
{:else}
  <div class="floaters" aria-hidden="true">
    {#each game.reactions as r (r.id)}
      <span style:left="{r.x}%">{r.emoji}</span>
    {/each}
  </div>
{/if}

<style>
  .picker {
    display: flex;
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 3px 6px;
  }
  .picker button {
    border: none;
    background: none;
    font-size: 1.35rem;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    transition: transform 0.1s;
  }
  .picker button:hover {
    transform: scale(1.25);
    background: #f1edff;
  }
  .picker button:active {
    transform: scale(0.9);
  }
  .floaters {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 4;
  }
  .floaters span {
    position: absolute;
    bottom: -40px;
    font-size: 2.4rem;
    animation: float-up 2.6s ease-out forwards;
  }
  @keyframes float-up {
    0% {
      transform: translateY(0) scale(0.6);
      opacity: 0;
    }
    15% {
      opacity: 1;
      transform: translateY(-60px) scale(1.1);
    }
    100% {
      transform: translateY(-420px) scale(1) rotate(15deg);
      opacity: 0;
    }
  }
</style>
