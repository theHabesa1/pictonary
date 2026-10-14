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
  let mobileTab = $state('chat');

  // Fit the 4:3 board inside whatever space is left (desktop), or full width (phones).
  let innerWidth = $state(1200);
  let areaW = $state(0);
  let areaH = $state(0);
  const mobile = $derived(innerWidth <= 860);
  const boardW = $derived(Math.floor(mobile ? areaW : Math.min(areaW, (areaH * 4) / 3)));
</script>

<svelte:window bind:innerWidth />

<div class="game" class:drawer={canDraw}>
  <header class="bar card">
    <div class="bar-left">
      <div class="round">
        <small>Round</small>
        <b>{Math.min(s.round, s.settings.rounds)}<span>/{s.settings.rounds}</span></b>
      </div>
      {#if s.settings.mode === 'teams' && turn && drawer}
        <div class="team-turn" style:--team={TEAMS[turn.team].color}>
          {TEAMS[turn.team].emoji}<span>{TEAMS[turn.team].name}</span>
        </div>
      {/if}
    </div>

    <div class="bar-center">
      <WordHint state={s} {drawer} {isDrawer} />
    </div>

    <div class="bar-right">
      {#if turn && (s.phase === 'drawing' || s.phase === 'choosing')}
        <Timer seconds={secondsLeft} total={turn.duration} />
      {/if}
      <button class="btn white icon" onclick={toggleMute} title={game.muted ? 'Unmute' : 'Mute'} aria-label={game.muted ? 'Unmute sounds' : 'Mute sounds'}>
        {game.muted ? '🔇' : '🔊'}
      </button>
      <div class="menu-wrap">
        <button class="btn white icon" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>☰</button>
        {#if menuOpen}
          <button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
          <div class="menu card" role="menu">
            <div class="room-code">Room <b>{s.code}</b></div>
            {#if (isHost || isDrawer) && (s.phase === 'drawing' || s.phase === 'choosing')}
              <button role="menuitem" onclick={() => { send('turn:skip'); menuOpen = false; }}>⏭️ Skip this turn</button>
            {/if}
            {#if isHost && s.phase !== 'gameOver'}
              <button role="menuitem" onclick={() => { if (confirm('End the game for everyone and go back to the lobby?')) send('game:lobby'); menuOpen = false; }}>⏹️ End game</button>
            {/if}
            <button
              role="menuitem"
              onclick={() => {
                navigator.clipboard?.writeText(`${location.origin}/?r=${s.code}`);
                menuOpen = false;
              }}>🔗 Copy invite link</button
            >
            <button role="menuitem" class="danger" onclick={() => confirm('Leave this game?') && leaveRoom()}>🚪 Leave room</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <aside class="players card scroll-thin" class:hide-mobile={mobileTab !== 'players'}>
    <Players state={s} />
  </aside>

  <main class="stage">
    <div class="board-area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
      <div class="board card" style:width="{boardW}px" style:height="{(boardW * 3) / 4}px">
        <Canvas {canDraw} />
        <Reactions />
        {#if s.phase === 'choosing' && turn}
          <ChooseWord {turn} {drawer} {isDrawer} seconds={secondsLeft} />
        {:else if s.phase === 'turnEnd' && turn?.reveal}
          <TurnEnd state={s} reveal={turn.reveal} {drawer} />
        {/if}
      </div>
    </div>
    {#if canDraw}
      <Toolbar />
    {:else if s.phase === 'drawing'}
      <div class="react-bar">
        <span class="drawing-who">{drawer?.avatar} <b>{drawer?.name}</b> is drawing</span>
        <Reactions buttons />
      </div>
    {/if}
  </main>

  <aside class="chat card" class:hide-mobile={mobileTab !== 'chat'}>
    <Chat />
  </aside>

  <nav class="mobile-tabs">
    <button class:on={mobileTab === 'chat'} onclick={() => (mobileTab = 'chat')}>💬 Chat &amp; guesses</button>
    <button class:on={mobileTab === 'players'} onclick={() => (mobileTab = 'players')}>🏆 Scores</button>
  </nav>

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
    grid-template-columns: 1fr auto 1fr;
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
    padding: 10px 12px;
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
  .mobile-tabs {
    display: none;
  }

  @media (max-width: 1100px) {
    .game {
      grid-template-columns: 200px minmax(0, 1fr) 270px;
    }
  }

  @media (max-width: 860px) {
    .game {
      height: auto;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
    }
    .bar {
      grid-template-columns: auto 1fr auto;
      padding: 6px 8px;
      gap: 8px;
      position: sticky;
      top: 8px;
      z-index: 20;
    }
    .team-turn span {
      display: none;
    }
    .round {
      padding: 4px 8px;
    }
    .board-area {
      flex: none;
    }
    .mobile-tabs {
      display: flex;
      gap: 6px;
      order: 3;
    }
    .mobile-tabs button {
      flex: 1;
      border: 2px solid var(--ink);
      background: #fff;
      border-radius: 12px;
      padding: 8px;
      font-weight: 800;
    }
    .mobile-tabs button.on {
      background: var(--yellow);
    }
    .stage {
      order: 2;
    }
    .chat,
    .players {
      order: 4;
    }
    .chat {
      height: max(300px, calc(100dvh - 75vw - 150px));
    }
    .players {
      max-height: none;
    }
    .hide-mobile {
      display: none;
    }
  }
  @media (max-width: 420px) {
    .bar-right :global(.btn.icon) {
      width: 36px;
      height: 36px;
      font-size: 1rem;
    }
  }
</style>
