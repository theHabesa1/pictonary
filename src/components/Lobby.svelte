<script>
  import { MAX_PLAYERS, TEAMS, gameInfo, isTeams } from '../../shared/constants.js';
  import { game, leaveRoom, send } from '../lib/game.svelte.js';
  import AccountButton from './AccountButton.svelte';
  import Logo from './Logo.svelte';
  import Settings from './Settings.svelte';
  import Chat from './Chat.svelte';

  const s = $derived(game.state);
  const isHost = $derived(s.hostId === s.me);
  const me = $derived(s.players.find((p) => p.id === s.me));
  const online = $derived(s.players.filter((p) => p.connected));
  const teams = $derived(
    TEAMS.slice(0, s.settings.teamCount).map((t) => ({ ...t, members: s.players.filter((p) => p.team === t.id) })),
  );
  const host = $derived(s.players.find((p) => p.id === s.hostId));
  const link = $derived(`${location.origin}${location.pathname}?r=${s.code}`);

  // On phones the settings collapse into a one-line summary.
  let settingsOpen = $state(false);
  const DIFF = { easy: '🟢 Easy', medium: '🟡 Medium', hard: '🔴 Hard', mixed: '🎲 Mixed' };
  const info = $derived(gameInfo(s.settings.game));
  const teamsOn = $derived(isTeams(s.settings));
  const summary = $derived(
    s.settings.game === 'cards'
      ? [
          '🃏 Color Clash',
          `🔁 ${s.settings.rounds} round${s.settings.rounds > 1 ? 's' : ''}`,
          `🂠 ${s.settings.handSize} cards each`,
          `⏱️ ${s.settings.turnTime}s per turn`,
          s.settings.stacking ? '😈 Stacking on' : '🙂 No stacking',
        ]
      : s.settings.game === 'imposter'
      ? [
          '🕵️ Imposter',
          `🔁 ${s.settings.rounds} round${s.settings.rounds > 1 ? 's' : ''}`,
          `💬 ${s.settings.clueRounds} clue${s.settings.clueRounds > 1 ? 's' : ''} each`,
          `⏱️ ${s.settings.clueTime}s per clue`,
          DIFF[s.settings.difficulty],
        ]
      : [
          teamsOn ? `👨‍👩‍👧‍👦 ${s.settings.teamCount} teams` : '🙋 Every player',
          `🔁 ${s.settings.rounds} round${s.settings.rounds > 1 ? 's' : ''}`,
          `⏱️ ${s.settings.drawTime}s`,
          s.settings.hints ? `💡 ${s.settings.hints} hint${s.settings.hints > 1 ? 's' : ''}` : '💡 No hints',
          DIFF[s.settings.difficulty],
          `📚 ${s.wordPool.toLocaleString()} words`,
        ],
  );
  const missing = $derived(Math.max(0, info.minPlayers - online.length));

  let copied = $state(false);
  async function copyLink() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Play Pictonary with me!', text: `Join my Pictonary room ${s.code} 🎨`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
    } catch {
      prompt('Copy this invite link:', link);
      return;
    }
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }

  const kick = (p) => confirm(`Remove ${p.name} from the room?`) && send('player:kick', p.id);
</script>

<div class="lobby">
  <header class="top">
    <Logo small />
    <div class="top-right">
      <AccountButton />
      <button class="btn white small" onclick={leaveRoom}>🚪 Leave</button>
    </div>
  </header>

  <section class="invite card">
    <div>
      <span class="label">Room code</span>
      <div class="code">{s.code}</div>
    </div>
    <div class="invite-actions">
      <button class="btn pink" onclick={copyLink}>{copied ? '✅ Link copied!' : '🔗 Invite friends'}</button>
      <span class="hint">Send the link — they just open it and pick a name.</span>
    </div>
  </section>

  <div class="grid">
    <section class="card players">
      <div class="section-head">
        <h2>Players <small>{online.length}/{MAX_PLAYERS}</small></h2>
        {#if isHost && teamsOn}
          <button class="btn small white" onclick={() => send('team:shuffle')}>🔀 Shuffle</button>
        {/if}
      </div>

      {#snippet chip(p)}
        <li class="chip" class:away={!p.connected} class:me={p.id === s.me}>
          <span class="av">{p.avatar}</span>
          <span class="nm">{p.name}{p.id === s.me ? ' (you)' : ''}</span>
          {#if p.level}<span class="lv" title="Level {p.level}">Lv {p.level}</span>{/if}
          {#if p.id === s.hostId}<span title="Host">👑</span>{/if}
          {#if !p.connected}<span class="tag">away</span>{/if}
          {#if isHost && p.id !== s.me}
            <button class="kick" title="Remove {p.name}" aria-label="Remove {p.name}" onclick={() => kick(p)}>✕</button>
          {/if}
        </li>
      {/snippet}

      {#if teamsOn}
        <div class="teams" style:--cols={Math.min(teams.length, 2)}>
          {#each teams as t (t.id)}
            <div class="team" style:--team={t.color}>
              <div class="team-head">
                <span class="team-emoji">{t.emoji}</span>
                <b>{t.name}</b>
                <small>{t.members.length}</small>
              </div>
              <ul>
                {#each t.members as p (p.id)}
                  {@render chip(p)}
                {:else}
                  <li class="empty">No one yet</li>
                {/each}
              </ul>
              {#if me.team !== t.id}
                <button class="btn small white join" onclick={() => send('team:set', { team: t.id })}>Join team</button>
              {:else}
                <div class="your-team">⭐ Your team</div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <ul class="solo-list">
          {#each s.players as p (p.id)}
            {@render chip(p)}
          {/each}
        </ul>
      {/if}

      {#if missing}
        <p class="waiting">
          ⏳ {info.name} needs {info.minPlayers}+ players: waiting for {missing} more… share the invite link!
        </p>
      {/if}
    </section>

    <section class="card settings" class:open={settingsOpen}>
      <button class="settings-toggle" onclick={() => (settingsOpen = !settingsOpen)} aria-expanded={settingsOpen}>
        <h2>⚙️ Game settings</h2>
        <span class="toggle-cta">{settingsOpen ? 'Hide' : isHost ? 'Change' : 'View'} <span class="chev">▾</span></span>
      </button>
      <div class="section-head desktop-head">
        <h2>Game settings</h2>
        {#if !isHost}<small class="ro">Only {host?.name ?? 'the host'} can change these</small>{/if}
      </div>
      <div class="summary">
        {#each summary as item}<span>{item}</span>{/each}
      </div>
      <div class="settings-body">
        {#if !isHost}<p class="ro ro-mobile">Only {host?.name ?? 'the host'} can change these</p>{/if}
        <Settings settings={s.settings} editable={isHost} wordPool={s.wordPool} />
      </div>
    </section>

    <section class="card lobby-chat">
      <Chat compact />
    </section>
  </div>

  <footer class="start-bar">
    {#if isHost}
      <button class="btn green big" disabled={missing > 0} onclick={() => send('game:start')}>
        🚀 Start {info.emoji} {info.name}
      </button>
    {:else}
      <div class="wait-host">⏳ Waiting for <b>{host?.name ?? 'the host'}</b> to start the game…</div>
    {/if}
  </footer>
</div>

<style>
  .lobby {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 16px 110px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .invite {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    flex-wrap: wrap;
  }
  .code {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 2.4rem;
    letter-spacing: 0.18em;
    line-height: 1;
  }
  .invite-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .hint {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.9rem;
    max-width: 230px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    grid-template-rows: auto 1fr;
    gap: 16px;
  }
  .players {
    grid-row: span 2;
  }
  .players,
  .settings,
  .lobby-chat {
    padding: 18px;
    min-width: 0;
  }
  .lobby-chat {
    height: 300px;
    padding: 0;
    overflow: hidden;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  h2 {
    font-size: 1.35rem;
  }
  h2 small {
    color: var(--muted);
    font-size: 0.95rem;
  }
  .ro {
    color: var(--muted);
    font-weight: 700;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .solo-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: #fff;
    font-weight: 800;
    animation: pop-in 0.3s ease;
  }
  .chip.me {
    border-color: var(--ink);
    background: #fffbea;
  }
  .chip.away {
    opacity: 0.5;
  }
  .chip .av {
    font-size: 1.5rem;
  }
  .chip .nm {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lv {
    background: var(--violet);
    color: #fff;
    border-radius: 6px;
    padding: 0 5px;
    font-size: 0.72rem;
    flex: none;
  }
  .tag {
    font-size: 0.75rem;
    background: var(--line);
    border-radius: 6px;
    padding: 1px 6px;
  }
  .kick {
    border: none;
    background: none;
    color: var(--muted);
    font-weight: 900;
    border-radius: 6px;
    padding: 2px 6px;
  }
  .kick:hover {
    background: #ffe4e6;
    color: var(--red);
  }
  .teams {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 12px;
  }
  .team {
    border: 3px solid var(--team);
    border-radius: 16px;
    padding: 10px;
    background: color-mix(in srgb, var(--team) 8%, white);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .team-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }
  .team-head b {
    flex: 1;
    color: color-mix(in srgb, var(--team) 70%, black);
  }
  .team-head small {
    background: var(--team);
    color: #fff;
    border-radius: 999px;
    padding: 0 8px;
    font-weight: 700;
  }
  .team-emoji {
    font-size: 1.5rem;
  }
  .team ul {
    flex: 1;
  }
  .empty {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.9rem;
    padding: 8px;
    text-align: center;
  }
  .join {
    align-self: stretch;
  }
  .your-team {
    text-align: center;
    font-weight: 800;
    font-size: 0.9rem;
    color: color-mix(in srgb, var(--team) 70%, black);
    padding: 4px;
  }
  .waiting {
    margin: 14px 0 0;
    padding: 10px 12px;
    background: #fff7d6;
    border: 2px dashed #e0b400;
    border-radius: 12px;
    font-weight: 700;
    text-align: center;
  }
  .start-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
  }
  .start-bar > * {
    pointer-events: auto;
  }
  .start-bar .btn {
    min-width: 260px;
  }
  .wait-host {
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: 999px;
    padding: 12px 22px;
    font-weight: 700;
    box-shadow: var(--shadow-sm);
  }
  .settings-toggle,
  .summary,
  .ro-mobile {
    display: none;
  }
  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .players {
      grid-row: auto;
    }
    .code {
      font-size: 2rem;
    }
  }

  /* ───── phones ───── */
  @media (max-width: 640px) {
    .lobby {
      padding: 10px 10px 96px;
      gap: 10px;
    }
    .invite {
      padding: 12px 14px;
      gap: 10px;
      flex-wrap: nowrap;
    }
    .invite .label {
      font-size: 0.7rem;
      margin-bottom: 2px;
    }
    .code {
      font-size: 1.7rem;
      letter-spacing: 0.12em;
    }
    .hint {
      display: none;
    }
    .invite .btn {
      padding: 10px 14px;
      font-size: 1rem;
    }
    .grid {
      gap: 10px;
    }
    .players,
    .settings {
      padding: 12px;
    }
    h2 {
      font-size: 1.15rem;
    }
    .section-head {
      margin-bottom: 10px;
    }
    .solo-list {
      grid-template-columns: 1fr 1fr;
    }
    .chip {
      padding: 5px 8px;
      gap: 6px;
      font-size: 0.92rem;
    }
    .chip .av {
      font-size: 1.3rem;
    }
    .teams {
      gap: 8px;
    }
    .team {
      padding: 8px;
    }
    .team-head {
      font-size: 0.95rem;
    }
    .lobby-chat {
      height: 220px;
    }
    /* Settings collapse to a summary on phones. */
    .desktop-head {
      display: none;
    }
    .settings-toggle {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      border: none;
      background: none;
      padding: 0;
      text-align: left;
    }
    .toggle-cta {
      font-weight: 800;
      color: var(--violet);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .chev {
      transition: transform 0.2s;
    }
    .open .chev {
      transform: rotate(180deg);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 10px;
    }
    .summary span {
      background: var(--cream);
      border: 2px solid var(--line);
      border-radius: 999px;
      padding: 3px 9px;
      font-weight: 800;
      font-size: 0.8rem;
    }
    .open .summary {
      display: none;
    }
    .settings-body {
      display: none;
      margin-top: 12px;
    }
    .open .settings-body {
      display: block;
    }
    .ro-mobile {
      display: block;
      margin: 0 0 10px;
      font-size: 0.85rem;
    }
    .start-bar {
      padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
      background: var(--bg);
      border-top: 2px solid var(--line);
    }
    .start-bar .btn {
      width: 100%;
      min-width: 0;
    }
    .wait-host {
      width: 100%;
      text-align: center;
      padding: 10px 14px;
      font-size: 0.92rem;
    }
  }
  @media (max-width: 359px) {
    .teams {
      grid-template-columns: 1fr;
    }
    .solo-list {
      grid-template-columns: 1fr;
    }
  }
</style>
