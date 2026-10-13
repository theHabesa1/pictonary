<script>
  import { game } from './lib/game.svelte.js';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import Game from './components/Game.svelte';

  const phase = $derived(game.state?.phase);
</script>

{#if !game.state}
  {#if game.joining}
    <div class="splash">
      <div class="spinner">🎨</div>
      <p>Jumping back into the room…</p>
    </div>
  {:else}
    <Home />
  {/if}
{:else if phase === 'lobby'}
  <Lobby />
{:else}
  <Game />
{/if}

{#if !game.connected && (game.state || game.joining)}
  <div class="offline" role="status">📡 Connection lost — reconnecting…</div>
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    text-align: center;
    color: #fff;
    font-family: var(--font-display);
    font-size: 1.2rem;
  }
  .spinner {
    font-size: 4rem;
    animation: wiggle 0.6s ease-in-out infinite;
  }
  .offline {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    background: var(--ink);
    color: #fff;
    padding: 10px 18px;
    border-radius: 999px;
    font-weight: 700;
    z-index: 100;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }
</style>
