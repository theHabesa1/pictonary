<script>
  import { AVATARS } from '../../shared/constants.js';
  import {
    createRoom, game, joinAsNewPlayer, joinRoom, lastSeat, profile, saveProfile, takeOverSeat, urlCode,
  } from '../lib/game.svelte.js';
  import { saveAccountProfile } from '../lib/account.svelte.js';
  import AccountButton from './AccountButton.svelte';
  import GameSlider from './GameSlider.svelte';
  import Logo from './Logo.svelte';

  const saveAll = () => {
    saveProfile();
    saveAccountProfile();
  };

  const resume = urlCode ? null : lastSeat();
  let code = $state(urlCode ?? '');
  let busy = $state(false);
  let showAvatars = $state(false);

  const nameOk = $derived(profile.name.trim().length > 0);

  async function run(fn) {
    if (busy) return;
    if (!nameOk) {
      game.error = 'Pick a name first ✏️';
      const input = document.getElementById('name');
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
      return;
    }
    busy = true;
    game.error = '';
    await fn();
    busy = false;
  }

  const create = (gameId) => run(() => createRoom(gameId));
  const join = () =>
    run(async () => {
      const c = code.trim().toUpperCase();
      if (c.length < 4) {
        game.error = 'Enter the room code your friend shared 🔑';
        return;
      }
      await joinRoom(c);
    });

  function pickAvatar(a) {
    profile.avatar = a;
    saveAll();
  }
</script>

<main class="home">
  <div class="account-corner"><AccountButton /></div>
  <Logo />
  <p class="tagline">
    Free party games for family &amp; friends 🎉<br />Pick a game, share the link, play together. No sign-up needed.
  </p>

  {#if game.seatConflict}
    <div class="card panel conflict" role="alertdialog" aria-labelledby="conflict-title">
      <h2 id="conflict-title">👀 You're already in this game</h2>
      <p>
        You're playing as <b>{game.seatConflict.name}</b> in room <b>{game.seatConflict.code}</b>, probably in another tab or on
        another device.
      </p>
      <button class="btn green big wide" onclick={takeOverSeat}>▶️ Continue here as {game.seatConflict.name}</button>
      <button class="btn white wide" onclick={joinAsNewPlayer}>🙋 I'm someone else, join as a new player</button>
    </div>
  {/if}

  <div class="body" class:hidden={game.seatConflict}>
    <!-- 1. Who are you? -->
    <section class="card panel you">
      {#if resume}
        <button class="btn blue wide resume" disabled={busy} onclick={() => run(() => joinRoom(resume.code))}>
          🎮 Jump back into room <b class="code">{resume.code}</b>
        </button>
      {/if}
      <div class="who">
        <button
          class="avatar-big"
          onclick={() => (showAvatars = !showAvatars)}
          title="Change your avatar"
          aria-label="Change your avatar"
          aria-expanded={showAvatars}
        >
          <span>{profile.avatar}</span>
          <small>✏️</small>
        </button>
        <div class="name-field">
          <label class="label" for="name">Your name</label>
          <input
            id="name"
            class="input"
            maxlength="20"
            placeholder="e.g. Grandma Sue"
            autocomplete="nickname"
            bind:value={profile.name}
            onchange={saveAll}
            onkeydown={(e) => e.key === 'Enter' && urlCode && join()}
          />
        </div>
      </div>
      {#if showAvatars}
        <div class="avatars scroll-thin" role="radiogroup" aria-label="Avatar">
          {#each AVATARS as a}
            <button class="av" class:sel={a === profile.avatar} role="radio" aria-checked={a === profile.avatar} onclick={() => pickAvatar(a)}>{a}</button>
          {/each}
        </div>
      {/if}

      {#if urlCode}
        <button class="btn green big wide" disabled={busy} onclick={join}>
          🚪 Join room <b class="code">{urlCode}</b>
        </button>
        <a class="small-link" href={location.pathname}>or pick a game and create your own room</a>
      {/if}

      {#if game.error}
        <p class="error" role="alert">{game.error}</p>
      {/if}
    </section>

    {#if !urlCode}
      <!-- 2. Pick a game -->
      <h2 class="pick">Pick a game</h2>
      <GameSlider {busy} onplay={create} />

      <!-- 3. Or join a friend's room -->
      <section class="card join-strip">
        <span class="join-label">🔑 Got a room code?</span>
        <div class="join-row">
          <input
            class="input code-input"
            placeholder="CODE"
            maxlength="6"
            bind:value={code}
            oninput={() => (code = code.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onkeydown={(e) => e.key === 'Enter' && join()}
            aria-label="Room code"
          />
          <button class="btn blue" disabled={busy || code.length < 4} onclick={join}>Join</button>
        </div>
      </section>
    {/if}
  </div>
</main>

<style>
  .home {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 16px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .body {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .tagline {
    margin: -4px 0 0;
    text-align: center;
    color: var(--ink-soft);
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1.45;
  }
  .panel {
    width: 100%;
    max-width: 560px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hidden {
    display: none;
  }
  .account-corner {
    align-self: flex-end;
    margin-bottom: -12px;
    min-height: 34px;
  }
  .conflict {
    text-align: center;
    gap: 12px;
  }
  .conflict h2 {
    font-size: 1.35rem;
  }
  .conflict p {
    margin: 0;
    font-weight: 600;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .conflict .btn {
    white-space: normal;
  }
  .resume {
    animation: pop-in 0.35s ease;
  }
  .who {
    display: flex;
    gap: 14px;
    align-items: flex-end;
  }
  .name-field {
    flex: 1;
  }
  .avatar-big {
    position: relative;
    flex: none;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    border: 3px solid var(--ink);
    background: var(--cream);
    font-size: 2.4rem;
    display: grid;
    place-items: center;
    box-shadow: var(--shadow-sm);
    transition: transform 0.15s;
  }
  .avatar-big:hover {
    transform: rotate(-8deg) scale(1.05);
  }
  .avatar-big small {
    position: absolute;
    right: -6px;
    bottom: -4px;
    font-size: 0.9rem;
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
  }
  .avatars {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    max-height: 140px;
    overflow-y: auto;
    padding: 4px;
    background: var(--cream);
    border-radius: 12px;
    animation: pop-in 0.2s ease;
  }
  .av {
    border: 2px solid transparent;
    background: none;
    border-radius: 10px;
    font-size: 1.5rem;
    height: 42px;
    transition: transform 0.1s;
  }
  .av:hover {
    transform: scale(1.15);
  }
  .av.sel {
    border-color: var(--ink);
    background: var(--yellow);
  }
  .wide {
    width: 100%;
  }
  .code {
    letter-spacing: 0.12em;
  }
  .pick {
    align-self: flex-start;
    font-size: 1.5rem;
    margin: 8px 0 -6px 4px;
  }
  .join-strip {
    width: 100%;
    max-width: 560px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    box-shadow: var(--shadow-sm);
  }
  .join-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.1rem;
    white-space: nowrap;
  }
  .join-row {
    display: flex;
    gap: 8px;
  }
  .code-input {
    width: 140px;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    text-align: center;
    font-family: var(--font-display);
    font-size: 1.2rem;
    padding: 8px 10px;
  }
  .small-link {
    text-align: center;
    color: var(--muted);
    font-weight: 700;
    font-size: 0.95rem;
  }
  .error {
    margin: 0;
    padding: 10px 12px;
    background: #ffe4e6;
    border: 2px solid var(--red);
    border-radius: 12px;
    color: #9f1239;
    font-weight: 700;
    text-align: center;
  }
  @media (max-width: 520px) {
    .home {
      padding-top: 14px;
      gap: 12px;
    }
    .panel {
      padding: 14px;
    }
    .join-strip {
      flex-direction: column;
      align-items: stretch;
    }
    .join-row .code-input {
      flex: 1;
      width: auto;
    }
  }
</style>
