<script>
  import { onMount } from 'svelte';
  import { TEAMS, isTeams } from '../../shared/constants.js';
  import { STARS } from '../../shared/powerups.js';
  import { account, openAccount } from '../lib/account.svelte.js';
  import { leaveRoom, send } from '../lib/game.svelte.js';
  import { sfx } from '../lib/sound.js';

  let { state: s, isHost } = $props();

  // Stars arrive a moment after the game ends (saved to the database first).
  const rw = $derived(account.rewards);
  $effect(() => {
    if (rw) setTimeout(() => sfx('coins'), 400);
  });

  const ranked = $derived([...s.players].sort((a, b) => b.score - a.score));
  const teams = $derived(isTeams(s.settings));
  const teamRank = $derived(
    TEAMS.slice(0, s.settings.teamCount)
      .map((t) => ({ ...t, score: s.teamScores[t.id] ?? 0, members: ranked.filter((p) => p.team === t.id) }))
      .filter((t) => t.members.length)
      .sort((a, b) => b.score - a.score),
  );
  const tie = $derived(teams ? teamRank.length > 1 && teamRank[0].score === teamRank[1].score : ranked.length > 1 && ranked[0].score === ranked[1].score);
  const podium = $derived([ranked[1], ranked[0], ranked[2]]); // 2nd, 1st, 3rd
  const host = $derived(s.players.find((p) => p.id === s.hostId));

  let canvas;
  onMount(() => {
    // Lightweight confetti.
    const ctx = canvas.getContext('2d');
    const colors = ['#ffd23f', '#ff5fa2', '#3bc9ff', '#22c55e', '#ff8a3d', '#8f5bff'];
    let w, h;
    const resize = () => {
      w = canvas.width = innerWidth;
      h = canvas.height = innerHeight;
    };
    resize();
    addEventListener('resize', resize);
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      size: 6 + Math.random() * 8,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame;
    const start = performance.now();
    const loop = (t) => {
      ctx.clearRect(0, 0, w, h);
      const fading = t - start > 6000;
      let alive = 0;
      for (const b of bits) {
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        if (b.y > h + 20) {
          if (fading) continue;
          b.y = -20;
          b.x = Math.random() * w;
        }
        alive++;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      }
      if (alive) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
    };
  });
</script>

<div class="screen">
  <canvas bind:this={canvas} class="confetti" aria-hidden="true"></canvas>
  <div class="panel card">
    {#if teams && teamRank.length}
      <div class="trophy">🏆</div>
      <h2>
        {#if tie}It's a tie!{:else}<span style:color={teamRank[0].color}>{teamRank[0].emoji} {teamRank[0].name}</span> win!{/if}
      </h2>
      <ol class="team-list">
        {#each teamRank as t, i (t.id)}
          <li style:--team={t.color} class:winner={i === 0}>
            <span class="pos">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
            <span class="tn">{t.emoji} {t.name}</span>
            <span class="members">{t.members.map((m) => m.avatar).join(' ')}</span>
            <b>{t.score}</b>
          </li>
        {/each}
      </ol>
      {#if ranked[0]?.score > 0}
        <p class="mvp">⭐ MVP: <b>{ranked[0].avatar} {ranked[0].name}</b> with {ranked[0].score} points</p>
      {/if}
    {:else}
      <h2>{tie ? "🤝 It's a tie!" : `🏆 ${ranked[0]?.name} wins!`}</h2>
      <div class="podium">
        {#each podium as p, i}
          {#if p}
            {@const place = [2, 1, 3][i]}
            <div class="step place-{place}">
              <span class="pav">{p.avatar}</span>
              <span class="pname">{p.name}</span>
              <span class="pscore">{p.score}</span>
              <div class="block">{place}</div>
            </div>
          {/if}
        {/each}
      </div>
      {#if ranked.length > 3}
        <ol class="rest" start="4">
          {#each ranked.slice(3) as p (p.id)}
            <li><span>{p.avatar} {p.name}</span><b>{p.score}</b></li>
          {/each}
        </ol>
      {/if}
    {/if}

    {#if s.gameOverReason}<p class="reason">{s.gameOverReason}</p>{/if}

    {#if rw}
      <div class="rewards">
        <div class="earned">+{rw.stars} ⭐</div>
        <div class="parts">
          {#if rw.parts.points}<span>🎯 {rw.parts.points} for points</span>{/if}
          {#if rw.parts.win}<span>🏆 +{rw.parts.win} win</span>{/if}
          {#if rw.parts.podium}<span>🥈 +{rw.parts.podium} podium</span>{/if}
          {#if rw.parts.daily}<span>☀️ +{rw.parts.daily} daily bonus</span>{/if}
        </div>
        {#if rw.capped}<small>You hit today's limit of {STARS.dailyCap} ⭐ — more tomorrow!</small>{/if}
        {#if rw.leveledUp}<div class="lvup">🎉 Level up! You're now <b>Level {rw.user.level}</b></div>{/if}
        <button class="btn small white" onclick={() => openAccount('shop')}>🛒 Card shop · {rw.user.stars} ⭐</button>
      </div>
    {:else if !account.user && !account.checking}
      <div class="rewards guest">
        <span>⭐ Sign in to earn stars from every game and unlock power-up cards!</span>
        <button class="btn small green" onclick={() => openAccount('signup')}>Create a free account</button>
      </div>
    {/if}

    <div class="actions">
      {#if isHost}
        <button class="btn green big" onclick={() => send('game:start')}>🔁 Play again</button>
        <button class="btn white" onclick={() => send('game:lobby')}>⚙️ Change settings</button>
      {:else}
        <p class="wait">⏳ Waiting for {host?.name ?? 'the host'} to start another round…</p>
      {/if}
      <button class="btn white small" onclick={leaveRoom}>🚪 Leave</button>
    </div>
  </div>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(29, 20, 66, 0.7);
    backdrop-filter: blur(4px);
    overflow-y: auto;
    animation: fade 0.3s ease;
  }
  .confetti {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  .panel {
    position: relative;
    z-index: 2;
    width: min(560px, 100%);
    padding: 24px 22px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    animation: pop-in 0.45s ease;
  }
  h2 {
    font-size: clamp(1.6rem, 5vw, 2.3rem);
  }
  .trophy {
    font-size: 4rem;
    animation: bob 1.4s ease-in-out infinite;
  }
  .podium {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-top: 8px;
  }
  .step {
    flex: 1;
    max-width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    animation: pop-in 0.5s ease backwards;
  }
  .place-1 {
    animation-delay: 0.5s;
  }
  .place-2 {
    animation-delay: 0.25s;
  }
  .pav {
    font-size: 2.6rem;
  }
  .place-1 .pav {
    font-size: 3.6rem;
    animation: bob 1.2s ease-in-out infinite;
  }
  .pname {
    font-weight: 800;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pscore {
    font-weight: 800;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .block {
    width: 100%;
    border: 3px solid var(--ink);
    border-radius: 12px 12px 0 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 2rem;
    color: #fff;
    display: grid;
    place-items: center;
    -webkit-text-stroke: 1.5px var(--ink);
    paint-order: stroke fill;
  }
  .place-1 .block {
    height: 120px;
    background: #ffd23f;
  }
  .place-2 .block {
    height: 85px;
    background: #cbd5e1;
  }
  .place-3 .block {
    height: 60px;
    background: #f0a868;
  }
  .rest,
  .team-list {
    list-style: none;
    padding: 0;
    margin: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rest li {
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    border: 2px solid var(--line);
    border-radius: 10px;
    font-weight: 800;
  }
  .team-list li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'pos tn score' 'pos members score';
    column-gap: 10px;
    align-items: center;
    text-align: left;
    padding: 8px 14px;
    border: 3px solid var(--team);
    border-radius: 14px;
    background: color-mix(in srgb, var(--team) 10%, white);
  }
  .team-list li.winner {
    box-shadow: 0 4px 0 var(--team);
    transform: scale(1.03);
  }
  .pos {
    grid-area: pos;
    font-size: 1.6rem;
  }
  .tn {
    grid-area: tn;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.15rem;
  }
  .members {
    grid-area: members;
    font-size: 0.95rem;
  }
  .team-list b {
    grid-area: score;
    font-family: var(--font-display);
    font-size: 1.5rem;
  }
  .mvp,
  .reason {
    margin: 0;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .rewards {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px;
    border: 3px solid #f5b400;
    border-radius: 16px;
    background: #fffbea;
    animation: pop-in 0.4s ease;
  }
  .rewards.guest {
    border-style: dashed;
    font-weight: 800;
  }
  .earned {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 2rem;
    color: #b45309;
    -webkit-text-stroke: 1px var(--ink);
    paint-order: stroke fill;
    animation: bob 1.2s ease-in-out infinite;
  }
  .parts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
  }
  .parts span {
    background: #fff;
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 2px 9px;
    font-weight: 800;
    font-size: 0.82rem;
  }
  .rewards small {
    color: var(--muted);
    font-weight: 700;
  }
  .lvup {
    font-weight: 800;
    color: var(--violet);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .wait {
    margin: 0;
    font-weight: 700;
    width: 100%;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
