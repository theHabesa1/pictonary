<script>
  import { POWERUPS, POWERUP_IDS } from '../../shared/powerups.js';
  import { openAccount } from '../lib/account.svelte.js';
  import { game, send } from '../lib/game.svelte.js';

  // compact: emoji + count only (phones).
  let { compact = false } = $props();

  const s = $derived(game.state);
  const t = $derived(s.turn);
  const me = $derived(s.players.find((p) => p.id === s.me));
  const isDrawer = $derived(t?.drawerId === s.me);
  const owned = $derived(s.cards ? POWERUP_IDS.filter((id) => s.cards[id] > 0) : []);

  /** Can I play this card right now? (The server checks again.) */
  function usable(id) {
    const def = POWERUPS[id];
    if (!t || t.cardPlayed || s.cardsLeft <= 0 || !(s.cards?.[id] > 0)) return false;
    if (def.when === 'choosing') return s.phase === 'choosing' && isDrawer;
    if (def.when === 'drawing') return s.phase === 'drawing' && isDrawer;
    if (s.phase !== 'drawing' || isDrawer || me?.guessed) return false;
    if (id === 'category' && t.category) return false;
    return id === 'splat' || t.canGuess;
  }
</script>

{#if s.settings.powerUps}
  {#if s.cards === null}
    <button class="cta" onclick={() => openAccount('signup')}>🎴 Sign in to earn ⭐ and power-up cards</button>
  {:else if !owned.length}
    <button class="cta" onclick={() => openAccount('shop')}>🎴 No power-up cards yet — visit the ⭐ shop</button>
  {:else}
    <div class="bar" class:compact role="toolbar" aria-label="Power-up cards">
      {#each owned as id (id)}
        {@const c = POWERUPS[id]}
        <button class="pc" disabled={!usable(id)} title="{c.name}: {c.desc}" onclick={() => send('power:use', id)}>
          <span class="e">{c.emoji}</span>
          {#if !compact}<span class="n">{c.name}</span>{/if}
          <span class="q">{s.cards[id]}</span>
        </button>
      {/each}
      <span class="left" title="Cards you can still play this game">
        {t?.cardPlayed ? '✅ played' : `${s.cardsLeft} left`}
      </span>
    </div>
  {/if}
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pc {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px 5px 6px;
    border: 2px solid var(--ink);
    border-radius: 12px;
    background: #fff;
    font-weight: 800;
    font-size: 0.85rem;
    box-shadow: 0 3px 0 var(--ink);
    transition: transform 0.1s, box-shadow 0.1s, opacity 0.2s;
  }
  .pc:not(:disabled):hover {
    transform: translateY(-2px) rotate(-2deg);
    background: #fffbea;
  }
  .pc:not(:disabled):active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 var(--ink);
  }
  .pc:disabled {
    opacity: 0.4;
    box-shadow: none;
    cursor: default;
  }
  .e {
    font-size: 1.2rem;
    line-height: 1;
  }
  .q {
    background: var(--ink);
    color: #fff;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 0.75rem;
  }
  .left {
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--muted);
    white-space: nowrap;
  }
  .compact {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 4px 2px 6px;
    scrollbar-width: none;
  }
  .compact .pc {
    flex: none;
    padding: 5px 7px;
  }
  .compact .e {
    font-size: 1.35rem;
  }
  .cta {
    align-self: center;
    border: none;
    background: none;
    color: var(--violet);
    padding: 2px 8px;
    font-weight: 800;
    font-size: 0.8rem;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
