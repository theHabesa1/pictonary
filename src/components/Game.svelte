<script>
  import { TEAMS } from '../../shared/constants.js';
  import * as board from '../lib/board.js';
  import { game, leaveRoom, send, toggleMute } from '../lib/game.svelte.js';
  import { sfx } from '../lib/sound.js';
  import Canvas from './Canvas.svelte';
  import Chat from './Chat.svelte';
  import ChooseWord from './ChooseWord.svelte';
  import GameOver from './GameOver.svelte';
  import Players from './Players.svelte';
  import Reactions from './Reactions.svelte';
  import Timer from './Timer.svelte';
  import Toolbar from './Toolbar.svelte';
  import TurnEnd from './TurnEnd.svelte';
  import WordHint from './WordHint.svelte';

  const s = $derived(game.state);
  const turn = $derived(s.turn);
  const isHost = $derived(s.hostId === s.me);
  const isDrawer = $derived(turn?.drawerId === s.me);
  const drawer = $derived(s.players.find((p) => p.id === turn?.drawerId));
  const canDraw = $derived(isDrawer && s.phase === 'drawing');
  const secondsLeft = $derived(turn ? Math.max(0, Math.ceil((turn.endsAt - game.now) / 1000)) : 0);

  $effect(() => board.setTurn(turn?.id ?? null));

  // Clock ticks during the last 10 seconds.
  let lastTick = 0;
  $effect(() => {
    if (s.phase === 'drawing' && secondsLeft <= 10 && secondsLeft > 0 && secondsLeft !== lastTick) sfx('tick');
    lastTick = secondsLeft;
  });

  let menuOpen = $state(false);
  const closeMenu = () => (menuOpen = false);

  // ── Layout ──
  // Phones (and portrait tablets) get one column: bar, players strip, board, then the chat
  // filling the rest of the screen with its input always visible. The app is pinned to the
  // visual viewport so the on-screen keyboard shrinks the layout instead of covering it.
  let vw = $state(innerWidth);
  let vh = $state(innerHeight);
  let vvTop = $state(0);
  let portrait = $state(innerHeight > innerWidth);
  const phone = $derived(vw <= 760 || (vw <= 1024 && portrait));

  $effect(() => {
    const vv = window.visualViewport;
    const update = () => {
      vw = innerWidth;
      vh = vv?.height ?? innerHeight;
      vvTop = vv?.offsetTop ?? 0;
      // Ignore the height change caused by the keyboard when deciding orientation.
      if (!document.activeElement?.matches?.('input, textarea')) portrait = innerHeight > innerWidth;
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  });

  let areaW = $state(0);
  let areaH = $state(0);
  let barH = $state(0);
  let playersH = $state(0);
  let underH = $state(0);
  const CHAT_MIN = 150; // keep at least a few messages + the input visible on phones
  const boardW = $derived.by(() => {
    if (!phone) return Math.floor(Math.min(areaW, (areaH * 4) / 3));
    const maxH = vh - 12 - 18 - barH - playersH - underH - CHAT_MIN;
    return Math.floor(Math.max(160, Math.min(areaW, (maxH * 4) / 3)));
  });

  const inviteLink = $derived(`${location.origin}${location.pathname}?r=${s.code}`);
</script>

<div class="game" class:phone class:drawer={canDraw} style:--vv-h="{vh}px" style:--vv-top="{vvTop}px">
  <header class="bar card" bind:clientHeight={barH}>
    <div class="bar-left">
      <div class="round" title="Round">
        <small>Round</small>
        <b>{Math.min(s.round, s.settings.rounds)}<span>/{s.settings.rounds}</span></b>
      </div>
      {#if s.settings.mode === 'teams' && turn && drawer}
        <div class="team-turn" style:--team={TEAMS[turn.team].color} title="{TEAMS[turn.team].name}' turn">
          {TEAMS[turn.team].emoji}<span>{TEAMS[turn.team].name}</span>
        </div>
      {/if}
    </div>

    <div class="bar-center">
      <WordHint state={s} {drawer} {isDrawer} />
    </div>

    <div class="bar-right">
      {#if turn && (s.phase === 'drawing' || s.phase === 'choosing')}
        <Timer seconds={secondsLeft} total={turn.duration} small={phone} />
      {/if}
      {#if !phone}
        <button class="btn white icon" onclick={toggleMute} title={game.muted ? 'Unmute' : 'Mute'} aria-label={game.muted ? 'Unmute sounds' : 'Mute sounds'}>
          {game.muted ? '🔇' : '🔊'}
        </button>
      {/if}
      <div class="menu-wrap">
        <button class="btn white icon" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>☰</button>
        {#if menuOpen}
          <button class="scrim" aria-label="Close menu" onclick={closeMenu}></button>
          <div class="menu card" role="menu">
            <div class="room-code">Room <b>{s.code}</b></div>
            {#if phone}
              <button role="menuitem" onclick={() => { toggleMute(); closeMenu(); }}>{game.muted ? '🔊 Turn sounds on' : '🔇 Mute sounds'}</button>
            {/if}
            {#if (isHost || isDrawer) && (s.phase === 'drawing' || s.phase === 'choosing')}
              <button role="menuitem" onclick={() => { send('turn:skip'); closeMenu(); }}>⏭️ Skip this turn</button>
            {/if}
            {#if isHost && s.phase !== 'gameOver'}
              <button role="menuitem" onclick={() => { if (confirm('End the game for everyone and go back to the lobby?')) send('game:lobby'); closeMenu(); }}>⏹️ End game</button>
            {/if}
            <button role="menuitem" onclick={() => { navigator.clipboard?.writeText(inviteLink); closeMenu(); }}>🔗 Copy invite link</button>
            <button role="menuitem" class="danger" onclick={() => confirm('Leave this game?') && leaveRoom()}>🚪 Leave room</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <aside class="players scroll-thin" class:card={!phone} bind:clientHeight={playersH}>
    <Players state={s} strip={phone} />
  </aside>

  <main class="stage">
    <div class="board-area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
      <div class="board card" style:width="{boardW}px" style:height="{(boardW * 3) / 4}px">
        <Canvas {canDraw} />
        <Reactions />
        {#if s.waitingUntil}
          <div class="board-note" role="status">
            ⏳ Waiting for players to reconnect… ({Math.max(0, Math.ceil((s.waitingUntil - game.now) / 1000))}s)
          </div>
        {:else if drawer && !drawer.connected && (s.phase === 'drawing' || s.phase === 'choosing')}
          <div class="board-note" role="status">📶 {drawer.name} lost connection — giving them a moment to come back…</div>
        {/if}
        {#if s.phase === 'choosing' && turn}
          <ChooseWord {turn} {drawer} {isDrawer} seconds={secondsLeft} />
        {:else if s.phase === 'turnEnd' && turn?.reveal}
          <TurnEnd state={s} reveal={turn.reveal} {drawer} />
        {/if}
      </div>
    </div>
    <div class="under" bind:clientHeight={underH}>
      {#if canDraw}
        <Toolbar />
      {:else if s.phase === 'drawing' && !phone}
        <div class="react-bar">
          <span class="drawing-who">{drawer?.avatar} <b>{drawer?.name}</b> is drawing</span>
          <Reactions buttons />
        </div>
      {/if}
    </div>
  </main>

  <aside class="chat card">
    <Chat compact={phone} reactions={phone && s.phase === 'drawing' && !isDrawer} />
  </aside>

  {#if s.phase === 'gameOver'}
    <GameOver state={s} {isHost} />
  {/if}
</div>

<style>
  .game {
    height: 100dvh;
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 310px;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'bar bar bar'
      'players stage chat';
    gap: 12px;
    padding: 12px;
    max-width: 1500px;
    margin: 0 auto;
  }
  .bar {
    grid-area: bar;
    display: grid;
    grid-template-columns: minmax(max-content, 1fr) minmax(0, 2fr) minmax(max-content, 1fr);
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
  }
  .bar-left,
  .bar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bar-right {
    justify-content: flex-end;
  }
  .bar-center {
    min-width: 0;
  }
  .round {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--ink);
    color: #fff;
    border-radius: 12px;
    padding: 4px 12px;
    line-height: 1;
  }
  .round small {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.8;
  }
  .round b {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  .round b span {
    font-size: 0.9rem;
    opacity: 0.7;
  }
  .team-turn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--team);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 999px;
    border: 2px solid var(--ink);
    white-space: nowrap;
    font-size: 1.05rem;
  }
  .menu-wrap {
    position: relative;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    z-index: 40;
    cursor: default;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 41;
    min-width: 220px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    animation: pop-in 0.18s ease;
  }
  .menu button {
    text-align: left;
    border: none;
    background: none;
    padding: 12px;
    border-radius: 10px;
    font-weight: 800;
  }
  .menu button:hover {
    background: #f1edff;
  }
  .menu .danger {
    color: #be123c;
  }
  .room-code {
    padding: 8px 12px;
    color: var(--muted);
    font-weight: 700;
    border-bottom: 2px solid var(--line);
    margin-bottom: 4px;
  }
  .room-code b {
    color: var(--ink);
    letter-spacing: 0.12em;
  }
  .players {
    grid-area: players;
    overflow-y: auto;
    padding: 10px;
  }
  .chat {
    grid-area: chat;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .stage {
    grid-area: stage;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    align-items: center;
  }
  .board-area {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .board {
    position: relative;
    overflow: hidden;
    flex: none;
    border-radius: 16px;
    background: #fff;
    container-type: size;
  }
  .board-note {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    width: max-content;
    max-width: calc(100% - 16px);
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--ink);
    color: #fff;
    font-weight: 800;
    font-size: 0.85rem;
    text-align: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    animation: pop-in 0.25s ease;
  }
  .under {
    width: 100%;
  }
  .under:empty {
    display: none;
  }
  .react-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    flex-wrap: wrap;
  }
  .drawing-who {
    color: var(--ink);
    font-weight: 700;
  }

  @media (max-width: 1100px) {
    .game {
      grid-template-columns: 200px minmax(0, 1fr) 270px;
    }
  }

  /* ───────── Phone layout ───────── */
  .game.phone {
    position: fixed;
    left: 0;
    right: 0;
    top: var(--vv-top);
    height: var(--vv-h);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    max-width: none;
    margin: 0;
  }
  .phone .bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
    flex: none;
  }
  .phone .bar-left,
  .phone .bar-right {
    gap: 5px;
  }
  .phone .round {
    padding: 5px 7px;
    border-radius: 9px;
  }
  .phone .round small {
    display: none;
  }
  .phone .round b {
    font-size: 1.05rem;
  }
  .phone .round b span {
    font-size: 0.75rem;
  }
  .phone .team-turn {
    padding: 3px 7px;
    font-size: 1rem;
  }
  .phone .team-turn span {
    display: none;
  }
  .phone .bar-right :global(.btn.icon) {
    width: 36px;
    height: 36px;
    font-size: 1rem;
    border-radius: 10px;
  }
  .phone .players {
    flex: none;
    padding: 0;
    overflow: visible;
  }
  .phone .stage {
    flex: none;
    gap: 6px;
  }
  .phone .board-area {
    flex: none;
  }
  .phone .board {
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
  }
  .phone .chat {
    flex: 1;
    min-height: 0;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
</style>
