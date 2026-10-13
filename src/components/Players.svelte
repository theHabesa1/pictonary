<script>
  import { flip } from 'svelte/animate';
  import { TEAMS } from '../../shared/constants.js';

  let { state: s } = $props();

  const drawerId = $derived(s.turn?.drawerId);
  const ranked = $derived([...s.players].sort((a, b) => b.score - a.score));
  const rankOf = $derived(new Map(ranked.map((p, i) => [p.id, i + 1])));
  const teams = $derived(
    TEAMS.slice(0, s.settings.teamCount)
      .map((t) => ({
        ...t,
        score: s.teamScores[t.id] ?? 0,
        members: ranked.filter((p) => p.team === t.id),
      }))
      .filter((t) => t.members.length)
      .sort((a, b) => b.score - a.score),
  );
  const medal = (n) => ['🥇', '🥈', '🥉'][n - 1] ?? `#${n}`;
</script>

{#snippet row(p, showRank)}
  <div
    class="p"
    class:drawing={p.id === drawerId}
    class:guessed={p.guessed}
    class:away={!p.connected}
    class:me={p.id === s.me}
  >
    {#if showRank}<span class="rank">{ranked[0].score > 0 ? medal(rankOf.get(p.id)) : ''}</span>{/if}
    <span class="av">{p.avatar}</span>
    <span class="info">
      <span class="nm">{p.name}{p.id === s.me ? ' (you)' : ''}</span>
      <span class="pts">{p.score} pts</span>
    </span>
    <span class="badges">
      {#if p.id === drawerId}<span title="Drawing">✏️</span>{/if}
      {#if p.guessed}<span title="Guessed it">✅</span>{/if}
      {#if p.id === s.hostId}<span title="Host">👑</span>{/if}
      {#if !p.connected}<span title="Away">💤</span>{/if}
    </span>
  </div>
{/snippet}

{#if s.settings.mode === 'teams'}
  <div class="teams">
    {#each teams as t, i (t.id)}
      <section class="team" style:--team={t.color} animate:flip={{ duration: 400 }}>
        <header>
          <span class="emoji">{t.emoji}</span>
          <b>{t.name}</b>
          <span class="score">{i === 0 && t.score > 0 ? '👑 ' : ''}{t.score}</span>
        </header>
        {#each t.members as p (p.id)}
          {@render row(p, false)}
        {/each}
      </section>
    {/each}
  </div>
{:else}
  <div class="list">
    {#each ranked as p (p.id)}
      <div animate:flip={{ duration: 400 }}>{@render row(p, true)}</div>
    {/each}
  </div>
{/if}

<style>
  .list,
  .teams {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .teams {
    gap: 10px;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 12px;
    border: 2px solid var(--line);
    background: #fff;
    transition: background 0.3s, border-color 0.3s;
  }
  .p.me {
    border-color: var(--ink);
  }
  .p.drawing {
    background: #fff7d6;
    border-color: #f5b400;
  }
  .p.guessed {
    background: var(--green-soft);
    border-color: var(--green);
  }
  .p.away {
    opacity: 0.45;
  }
  .rank {
    width: 26px;
    text-align: center;
    font-weight: 900;
    font-size: 0.85rem;
    color: var(--muted);
    flex: none;
  }
  .av {
    font-size: 1.6rem;
    flex: none;
  }
  .drawing .av {
    animation: wiggle 0.8s ease-in-out infinite;
  }
  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    line-height: 1.15;
  }
  .nm {
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pts {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  .badges {
    display: flex;
    gap: 2px;
    flex: none;
  }
  .team {
    border: 3px solid var(--team);
    border-radius: 14px;
    padding: 6px;
    background: color-mix(in srgb, var(--team) 10%, white);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .team header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    font-family: var(--font-display);
  }
  .team header b {
    flex: 1;
    color: color-mix(in srgb, var(--team) 65%, black);
    font-size: 1rem;
  }
  .emoji {
    font-size: 1.3rem;
  }
  .score {
    background: var(--team);
    color: #fff;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 10px;
    border: 2px solid var(--ink);
  }
  .team .p {
    padding: 4px 6px;
  }
  .team .av {
    font-size: 1.3rem;
  }
</style>
