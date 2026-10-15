<script>
  import { AVATARS } from '../../shared/constants.js';
  import {
    createRoom, game, joinAsNewPlayer, joinRoom, lastSeat, profile, saveProfile, takeOverSeat, urlCode,
  } from '../lib/game.svelte.js';
  import { saveAccountProfile } from '../lib/account.svelte.js';
  import AccountButton from './AccountButton.svelte';
  import Logo from './Logo.svelte';

  const saveAll = () => {
    saveProfile();
    saveAccountProfile();
  };

  const resume = urlCode ? null : lastSeat();
  let code = $state(urlCode ?? '');
  let busy = $state(false);
  let showJoin = $state(false);

  const nameOk = $derived(profile.name.trim().length > 0);

  async function run(fn) {
    if (busy) return;
    if (!nameOk) {
      game.error = 'Pick a name first ✏️';
      document.getElementById('name')?.focus();
      return;
    }
    busy = true;
    game.error = '';
    await fn();
    busy = false;
  }

  const create = () => run(createRoom);
  const join = () =>
    run(async () => {
      const c = code.trim().toUpperCase();
      if (c.length < 4) {
        game.error = 'Enter the room code your friend shared 🔑';
        return;
      }
      await joinRoom(c);
    });

  function randomAvatar() {
    profile.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    saveAll();
  }
</script>

<main class="home">
  <div class="account-corner"><AccountButton /></div>
  <Logo />
  <p class="tagline">Draw it. Guess it. Laugh about it. 🎉<br />Free online Pictionary for family &amp; friends.</p>

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

  <section class="card panel" class:hidden={game.seatConflict}>
    {#if resume}
      <button class="btn blue wide resume" disabled={busy} onclick={() => run(() => joinRoom(resume.code))}>
        🎮 Jump back into room <b class="code">{resume.code}</b>
      </button>
    {/if}
    <div class="who">
      <button class="avatar-big" onclick={randomAvatar} title="Random avatar" aria-label="Pick a random avatar">
        <span>{profile.avatar}</span>
        <small>🎲</small>
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
          onkeydown={(e) => e.key === 'Enter' && (urlCode ? join() : create())}
        />
      </div>
    </div>

    <div class="avatars scroll-thin" role="radiogroup" aria-label="Avatar">
      {#each AVATARS as a}
        <button
          class="av"
          class:sel={a === profile.avatar}
          role="radio"
          aria-checked={a === profile.avatar}
          onclick={() => {
            profile.avatar = a;
            saveAll();
          }}>{a}</button
        >
      {/each}
    </div>

    {#if urlCode}
      <button class="btn green big wide" disabled={busy} onclick={join}>
        🚪 Join room <b class="code">{urlCode}</b>
      </button>
      <a class="small-link" href={location.pathname}>or create your own room</a>
    {:else}
      <button class="btn green big wide" disabled={busy} onclick={create}>✨ Create a room</button>

      {#if showJoin}
        <div class="join-row">
          <input
            class="input code-input"
            placeholder="ROOM CODE"
            maxlength="6"
            bind:value={code}
            oninput={() => (code = code.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onkeydown={(e) => e.key === 'Enter' && join()}
            aria-label="Room code"
          />
          <button class="btn blue" disabled={busy} onclick={join}>Join</button>
        </div>
      {:else}
        <button class="btn white wide" onclick={() => (showJoin = true)}>🔑 I have a room code</button>
      {/if}
    {/if}

    {#if game.error}
      <p class="error" role="alert">{game.error}</p>
    {/if}
  </section>

  <section class="how">
    <div class="step card">
      <span>🏠</span>
      <h3>Create a room</h3>
      <p>Send the invite link to family &amp; friends — no sign-up needed.</p>
    </div>
    <div class="step card">
      <span>👨‍👩‍👧‍👦</span>
      <h3>Teams or solo</h3>
      <p>Play team vs team, or everyone for themselves.</p>
    </div>
    <div class="step card">
      <span>💡</span>
      <h3>Hints drop in</h3>
      <p>As the clock runs down, letters of the word get revealed.</p>
    </div>
  </section>
</main>

<style>
  .home {
    max-width: 520px;
    margin: 0 auto;
    padding: 28px 16px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }
  .tagline {
    margin: -4px 0 4px;
    text-align: center;
    color: var(--ink-soft);
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1.45;
  }
  .panel {
    width: 100%;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .hidden {
    display: none;
  }
  .account-corner {
    align-self: flex-end;
    margin-bottom: -10px;
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
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 3px solid var(--ink);
    background: var(--cream);
    font-size: 2.6rem;
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
    font-size: 1.1rem;
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
  }
  .avatars {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    max-height: 96px;
    overflow-y: auto;
    padding: 4px;
    background: var(--cream);
    border-radius: 12px;
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
  .join-row {
    display: flex;
    gap: 10px;
  }
  .code-input {
    text-transform: uppercase;
    letter-spacing: 0.25em;
    text-align: center;
    font-family: var(--font-display);
    font-size: 1.25rem;
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
  .how {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .step {
    padding: 14px 12px;
    text-align: center;
    box-shadow: var(--shadow-sm);
  }
  .step span {
    font-size: 1.8rem;
  }
  .step h3 {
    font-size: 1rem;
    margin: 4px 0;
  }
  .step p {
    margin: 0;
    font-size: 0.82rem;
    color: var(--ink-soft);
    line-height: 1.35;
  }
  @media (max-width: 520px) {
    .how {
      grid-template-columns: 1fr;
    }
    .home {
      padding-top: 18px;
      gap: 14px;
    }
    .panel {
      padding: 16px;
    }
    .how {
      gap: 8px;
    }
    .step {
      display: grid;
      grid-template-columns: 40px 1fr;
      text-align: left;
      column-gap: 8px;
      align-items: center;
      padding: 10px 12px;
    }
    .step span {
      font-size: 1.5rem;
    }
    .step h3 {
      font-size: 0.95rem;
      margin: 0 0 2px;
    }
    .step p {
      font-size: 0.8rem;
    }
    .step span {
      grid-row: span 2;
    }
  }
</style>
