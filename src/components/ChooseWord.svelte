<script>
  import { DIFFICULTY_MULT, TEAMS } from '../../shared/constants.js';
  import { game, send } from '../lib/game.svelte.js';

  let { turn, drawer, isDrawer, seconds } = $props();

  const s = $derived(game.state);
  const teams = $derived(s.settings.mode === 'teams');
  const team = $derived(TEAMS[turn.team]);
  const myTeam = $derived(s.players.find((p) => p.id === s.me)?.team);
  const badge = {
    easy: ['Easy', '#22c55e'],
    medium: ['Medium', '#f59e0b'],
    hard: ['Hard', '#ef4444'],
    custom: ['Custom', '#8f5bff'],
  };
</script>

<div class="overlay">
  {#if isDrawer && turn.choices}
    <h2>✏️ Your turn to draw!</h2>
    <p class="sub">Pick a word — harder words are worth more points</p>
    <div class="choices">
      {#each turn.choices as c, i}
        {@const [label, color] = badge[c.difficulty] ?? badge.medium}
        <button class="choice" style:--c={color} style:animation-delay="{i * 0.07}s" onclick={() => send('word:choose', i)}>
          <span class="w">{c.word}</span>
          <span class="tag">{label} · ×{DIFFICULTY_MULT[c.difficulty] ?? 1}</span>
        </button>
      {/each}
    </div>
    <p class="auto">Auto-pick in <b>{seconds}s</b></p>
  {:else}
    <div class="big-av">{drawer?.avatar ?? '🎨'}</div>
    <h2>{drawer?.name ?? 'Someone'} is picking a word…</h2>
    {#if teams}
      {#if myTeam === turn.team}
        <p class="sub team" style:--team={team.color}>{team.emoji} Your team is up — get ready to guess!</p>
      {:else if s.settings.allowSteals}
        <p class="sub">🦝 It's the {team.name}' turn — guess first to <b>steal</b> the points!</p>
      {:else}
        <p class="sub">It's the {team.name}' turn — watch and wait for yours 👀</p>
      {/if}
    {:else}
      <p class="sub">Get ready to guess! 👀</p>
    {/if}
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
    gap: 10px;
    padding: 16px;
    text-align: center;
    background: rgba(29, 20, 66, 0.82);
    color: #fff;
    backdrop-filter: blur(3px);
    animation: fade 0.25s ease;
  }
  h2 {
    font-size: clamp(1.3rem, 3.5vw, 2rem);
  }
  .sub {
    margin: 0;
    font-weight: 700;
    opacity: 0.9;
  }
  .sub.team {
    background: var(--team);
    padding: 6px 14px;
    border-radius: 999px;
    border: 2px solid #fff;
    opacity: 1;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin: 10px 0;
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 140px;
    padding: 16px 18px 12px;
    border: 3px solid var(--ink);
    border-radius: 16px;
    background: #fff;
    color: var(--ink);
    box-shadow: 0 5px 0 var(--c);
    animation: pop-in 0.35s ease backwards;
    transition: transform 0.12s;
  }
  .choice:hover {
    transform: translateY(-4px) rotate(-1.5deg);
  }
  .w {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(1.1rem, 2.6vw, 1.5rem);
    text-transform: capitalize;
  }
  .tag {
    font-size: 0.75rem;
    font-weight: 800;
    color: #fff;
    background: var(--c);
    border-radius: 999px;
    padding: 2px 10px;
  }
  .auto {
    margin: 0;
    opacity: 0.8;
    font-weight: 700;
  }
  .big-av {
    font-size: 4.5rem;
    animation: bob 1.2s ease-in-out infinite;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* Small boards (phones): the board is a size container. */
  @container (max-height: 360px) {
    .overlay {
      gap: 6px;
      padding: 10px;
    }
    h2 {
      font-size: 1.1rem;
    }
    .sub {
      font-size: 0.82rem;
    }
    .choices {
      gap: 6px;
      margin: 2px 0;
    }
    .choice {
      min-width: 0;
      padding: 8px 12px 6px;
      gap: 4px;
      border-radius: 12px;
      box-shadow: 0 3px 0 var(--c);
    }
    .w {
      font-size: 1rem;
    }
    .tag {
      font-size: 0.65rem;
      padding: 1px 8px;
    }
    .auto {
      font-size: 0.8rem;
    }
    .big-av {
      font-size: 2.4rem;
    }
  }
</style>
