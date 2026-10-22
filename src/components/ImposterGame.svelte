<script>
  import { openAccount } from '../lib/account.svelte.js';
  import { openGuide } from '../lib/guide.svelte.js';
  import { game, leaveRoom, send, toggleMute } from '../lib/game.svelte.js';
  import Chat from './Chat.svelte';
  import GameOver from './GameOver.svelte';
  import Players from './Players.svelte';
  import Timer from './Timer.svelte';

  const s = $derived(game.state);
  const imp = $derived(s.imp);
  const isHost = $derived(s.hostId === s.me);
  const isImposter = $derived(imp?.role === 'imposter');
  const myTurn = $derived(s.phase === 'clues' && imp?.current === s.me);
  const online = $derived(s.players.filter((p) => p.connected));
  const seconds = $derived(imp?.endsAt ? Math.max(0, Math.ceil((imp.endsAt - game.now) / 1000)) : 0);
  const nameOf = (id) => s.players.find((p) => p.id === id);
  const cluesOf = (id) => (imp?.clues.find((c) => c.id === id)?.clues ?? []).map((c) => c ?? '…');

  // Your role starts hidden every round, so nobody sitting next to you can peek.
  let showRole = $state(false);
  let roundSeen = 0;
  $effect(() => {
    if (imp?.round && imp.round !== roundSeen) {
      roundSeen = imp.round;
      showRole = false;
    }
  });

  let clue = $state('');
  let guess = $state('');
  function sendClue(e) {
    e.preventDefault();
    if (!clue.trim()) return;
    send('imp:clue', clue.trim());
    clue = '';
  }
  function sendGuess(e) {
    e.preventDefault();
    if (!guess.trim()) return;
    send('imp:guess', guess.trim());
    guess = '';
  }

  let menuOpen = $state(false);
  const closeMenu = () => (menuOpen = false);

  // Step tracker + a tip for what to do right now (depends on the phase and your role).
  const STEPS = [['🃏', 'Role'], ['💬', 'Clues'], ['🗳️', 'Vote'], ['🎯', 'Guess'], ['🎭', 'Reveal']];
  const step = $derived(
    s.phase === 'clues' ? (showRole ? 1 : 0) : s.phase === 'vote' ? 2 : s.phase === 'guess' ? 3 : s.phase === 'impReveal' ? 4 : -1,
  );
  const tip = $derived.by(() => {
    if (s.phase === 'clues' && !showRole) return '👆 First, tap the card below to see your secret role.';
    if (s.phase === 'clues' && myTurn)
      return isImposter
        ? "🎤 Your turn! You don't know the word, so bluff a clue that fits the category and the clues so far."
        : '🎤 Your turn! Type one word that hints at the secret word, but not too obvious.';
    if (s.phase === 'clues')
      return isImposter
        ? '👂 Listen closely: the clues will help you guess the word and blend in.'
        : "👂 Listen to everyone's clues. Who sounds like they're guessing?";
    if (s.phase === 'vote')
      return isImposter
        ? '😈 Vote for someone else to throw everyone off!'
        : '🗳️ Tap the player you think is the imposter. Most votes gets accused.';
    if (s.phase === 'guess')
      return imp?.accusedId === s.me ? '🎯 Last chance: guess the secret word to steal the win!' : '🤞 The imposter was caught! Can they guess the word?';
    if (s.phase === 'impReveal') return '🎭 See who it was! Next round: a new word and a new imposter.';
    return '';
  });
  let innerWidth = $state(1200);
  const phone = $derived(innerWidth <= 760);

  const PHASE = {
    clues: '💬 Clue time',
    vote: '🗳️ Vote!',
    guess: '🎯 Last chance',
    impReveal: '🎭 The reveal',
    gameOver: '🏁 Game over',
  };
  const OUTCOME = {
    caught: ['🎉 The crew wins!', 'crew'],
    imposterGuessed: ['😱 Caught… but they guessed the word!', 'imp'],
    wrong: ['🕵️ The imposter fooled you!', 'imp'],
    tie: ['🕵️ A tie, so the imposter escapes!', 'imp'],
    imposterLeft: ['👋 The imposter left the game', 'none'],
  };
</script>

<svelte:window bind:innerWidth />

<div class="imp-game" class:phone>
  <header class="bar card">
    <div class="round" title="Round">
      <small>Round</small>
      <b>{imp?.round ?? s.settings.rounds}<span>/{imp?.rounds ?? s.settings.rounds}</span></b>
    </div>
    <div class="phase">
      <span class="lbl">🕵️ Imposter</span>
      <b>{PHASE[s.phase] ?? ''}</b>
    </div>
    <div class="bar-right">
      {#if imp?.endsAt && s.phase !== 'gameOver'}
        <Timer {seconds} total={imp.duration} small={phone} />
      {/if}
      <div class="menu-wrap">
        <button class="btn white icon" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>☰</button>
        {#if menuOpen}
          <button class="scrim" aria-label="Close menu" onclick={closeMenu}></button>
          <div class="menu card" role="menu">
            <div class="room-code">Room <b>{s.code}</b></div>
            <button role="menuitem" onclick={() => { toggleMute(); closeMenu(); }}>{game.muted ? '🔊 Turn sounds on' : '🔇 Mute sounds'}</button>
            {#if isHost && s.phase !== 'gameOver'}
              <button role="menuitem" onclick={() => { if (confirm('End the game for everyone and go back to the lobby?')) send('game:lobby'); closeMenu(); }}>⏹️ End game</button>
            {/if}
            <button role="menuitem" onclick={() => { openGuide(s.settings.game); closeMenu(); }}>❓ How to play</button>
            <button role="menuitem" onclick={() => { openAccount(); closeMenu(); }}>⭐ My account</button>
            <button role="menuitem" onclick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}?r=${s.code}`); closeMenu(); }}>🔗 Copy invite link</button>
            <button role="menuitem" class="danger" onclick={() => confirm('Leave this game?') && leaveRoom()}>🚪 Leave room</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <aside class="players scroll-thin" class:card={!phone}>
    <Players state={s} strip={phone} />
  </aside>

  <main class="stage scroll-thin">
    {#if step >= 0}
      <div class="tracker card">
        <ol class="steps">
          {#each STEPS as [emoji, label], i}
            <li class:done={i < step} class:now={i === step}><span>{emoji}</span> <span class="st">{label}</span></li>
          {/each}
        </ol>
        <p class="tip">{tip}</p>
        <button class="rules" onclick={() => openGuide('imposter')}>❓ Rules</button>
      </div>
    {/if}
    {#if imp?.reveal}
      {@const rv = imp.reveal}
      {@const [title, side] = OUTCOME[rv.outcome] ?? ['', 'none']}
      <section class="card reveal {side}">
        <h2>{title}</h2>
        <div class="imposters">
          {#each rv.imposterIds as id}
            {@const p = nameOf(id)}
            <div class="imp-person">
              <span class="av">{p?.avatar ?? '👻'}</span>
              <b>{p?.name ?? 'Someone'}</b>
              <small>was the imposter</small>
            </div>
          {/each}
        </div>
        <div class="the-word">
          <small>The secret word was</small>
          <b>{rv.word}</b>
          <span class="cat-chip">{rv.category}</span>
        </div>
        {#if rv.guess}
          <p class="their-guess">Their guess: “<b>{rv.guess}</b>” {rv.outcome === 'imposterGuessed' ? '✅' : '❌'}</p>
        {/if}
        {#if rv.votes.length}
          <div class="votes">
            <h4>Who voted for whom</h4>
            <ul>
              {#each rv.votes as v}
                <li class:hit={rv.imposterIds.includes(v.target)}>
                  <span>{nameOf(v.voter)?.avatar} {nameOf(v.voter)?.name}</span>
                  <span class="arrow">→</span>
                  <span>{nameOf(v.target)?.avatar} {nameOf(v.target)?.name}</span>
                  {#if rv.imposterIds.includes(v.target)}<span>🎯</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if rv.gains.length}
          <div class="gains">
            {#each rv.gains as g (g.id)}
              <span>{nameOf(g.id)?.avatar} {nameOf(g.id)?.name} <b>+{g.pts}</b></span>
            {/each}
          </div>
        {/if}
        <p class="next">{imp.round >= imp.rounds ? 'Final results' : 'Next round'} in {seconds}s…</p>
      </section>
    {:else if imp}
      <!-- Secret role -->
      <section class="card role" class:imposter={showRole && isImposter} class:crew={showRole && !isImposter}>
        {#if !showRole}
          <button class="reveal-btn" onclick={() => (showRole = true)}>
            <span class="big">🃏</span>
            <b>Tap to see your secret role</b>
            <small>Make sure nobody is peeking at your screen!</small>
          </button>
        {:else if isImposter}
          <div class="role-top">🕵️ You are the IMPOSTER</div>
          <p>You don't know the word. Listen to the clues, blend in, and don't get caught!</p>
          <div class="cat">Category: <b>{imp.category}</b></div>
          {#if imp.imposterCount > 1}<p class="small">There are {imp.imposterCount} imposters this round.</p>{/if}
          <button class="hide" onclick={() => (showRole = false)}>🙈 Hide</button>
        {:else}
          <div class="role-top">✅ You're on the crew</div>
          <div class="secret">
            <small>The secret word is</small>
            <b>{imp.word}</b>
          </div>
          <div class="cat">Category: <b>{imp.category}</b></div>
          <p>Give clues that prove you know it, without making it too easy for the imposter!</p>
          <button class="hide" onclick={() => (showRole = false)}>🙈 Hide</button>
        {/if}
      </section>

      {#if s.phase === 'clues'}
        <section class="card clues">
          <div class="sec-head">
            <b>💬 Clues</b>
            <small>Round {imp.clueRound} of {imp.clueRounds}</small>
          </div>
          <ol class="clue-list">
            {#each imp.clues as row (row.id)}
              {@const p = nameOf(row.id)}
              <li class:current={row.id === imp.current} class:away={p && !p.connected}>
                <span class="av">{p?.avatar ?? '👻'}</span>
                <span class="nm">{p?.name ?? 'Left'}{row.id === s.me ? ' (you)' : ''}</span>
                <span class="chips">
                  {#each row.clues as c}<span class="chip" class:skip={c === null}>{c ?? '…'}</span>{/each}
                  {#if row.id === imp.current}<span class="chip typing">✍️ thinking…</span>{/if}
                </span>
              </li>
            {/each}
          </ol>
          {#if myTurn}
            <form class="my-turn" onsubmit={sendClue}>
              <label for="clue">🎤 Your turn! {isImposter ? 'Bluff a clue that fits the category.' : 'Give a one-word clue.'}</label>
              <div class="input-row">
                <input id="clue" class="input" bind:value={clue} maxlength="24" autocomplete="off" autocapitalize="off" placeholder="One word…" />
                <button class="btn green" type="submit" disabled={!clue.trim()}>Send</button>
              </div>
            </form>
          {:else}
            <p class="waiting">⏳ Waiting for {nameOf(imp.current)?.name ?? '…'} to give a clue</p>
          {/if}
        </section>
      {:else if s.phase === 'vote'}
        <section class="card vote">
          <div class="sec-head">
            <b>🗳️ Who is the imposter?</b>
            <small>{imp.voted.length}/{online.length} voted</small>
          </div>
          <p class="hint">Tap a player to vote. You can change your mind until the timer runs out. Talk it over in the chat!</p>
          <div class="vote-grid">
            {#each s.players.filter((p) => p.id !== s.me) as p (p.id)}
              <button class="vote-card" class:on={imp.myVote === p.id} onclick={() => send('imp:vote', p.id)}>
                <span class="av">{p.avatar}</span>
                <b>{p.name}</b>
                <span class="their-clues">{cluesOf(p.id).join(' · ') || 'no clues'}</span>
                {#if imp.voted.includes(p.id)}<span class="voted">✓ voted</span>{/if}
                {#if imp.myVote === p.id}<span class="my-pick">Your vote</span>{/if}
              </button>
            {/each}
          </div>
        </section>
      {:else if s.phase === 'guess'}
        {@const caught = nameOf(imp.accusedId)}
        <section class="card guess">
          {#if imp.accusedId === s.me}
            <h3>🚨 You've been caught!</h3>
            <p>One last chance: guess the secret word to steal the win.</p>
            <form class="input-row" onsubmit={sendGuess}>
              <input class="input" bind:value={guess} maxlength="40" autocomplete="off" placeholder="The word is…" />
              <button class="btn green" type="submit" disabled={!guess.trim()}>Guess!</button>
            </form>
          {:else}
            <h3>🚨 {caught?.avatar} {caught?.name} was caught!</h3>
            <p>They get one chance to guess the secret word… 🤞</p>
          {/if}
        </section>
      {/if}
    {/if}
  </main>

  <aside class="chat card">
    <Chat compact={phone} />
  </aside>

  {#if s.phase === 'gameOver'}
    <GameOver state={s} {isHost} />
  {/if}
</div>

<style>
  .imp-game {
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
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
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
  .phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 0;
  }
  .phase .lbl {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .phase b {
    font-family: var(--font-display);
    font-size: 1.35rem;
  }
  .bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
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
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 2px 8px;
  }
  .stage > .card {
    padding: 16px 18px;
  }

  /* ───── step tracker ───── */
  .stage > .tracker {
    position: relative;
    padding: 10px 14px;
    box-shadow: var(--shadow-sm);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 4px;
    padding-right: 64px;
  }
  .steps li {
    flex: 1;
    text-align: center;
    font-weight: 800;
    font-size: 0.78rem;
    padding: 4px 2px;
    border-radius: 999px;
    background: var(--line);
    color: var(--muted);
    white-space: nowrap;
    transition: background 0.3s, color 0.3s;
  }
  .steps li.done {
    background: #dcfce7;
    color: #15803d;
  }
  .steps li.now {
    background: var(--ink);
    color: #fff;
    animation: pop-in 0.3s ease;
  }
  .tip {
    margin: 8px 0 0;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.4;
  }
  .rules {
    position: absolute;
    top: 8px;
    right: 10px;
    border: 2px solid var(--line);
    background: #fff;
    border-radius: 999px;
    padding: 2px 10px;
    font-weight: 800;
    font-size: 0.8rem;
    color: var(--violet);
  }

  /* ───── role card ───── */
  .role {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition: background 0.3s;
  }
  .role.crew {
    background: #ecfdf3;
    border-color: #15803d;
    box-shadow: 0 5px 0 #15803d;
  }
  .role.imposter {
    background: #fff1f2;
    border-color: #be123c;
    box-shadow: 0 5px 0 #be123c;
  }
  .reveal-btn {
    border: 3px dashed var(--violet);
    background: #f5f2ff;
    border-radius: 16px;
    padding: 18px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-weight: 800;
  }
  .reveal-btn:hover {
    background: #ece7ff;
  }
  .reveal-btn .big {
    font-size: 2.6rem;
    animation: wiggle 1.2s ease-in-out infinite;
  }
  .reveal-btn b {
    font-family: var(--font-display);
    font-size: 1.25rem;
  }
  .reveal-btn small {
    color: var(--muted);
  }
  .role-top {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.4rem;
  }
  .imposter .role-top {
    color: #be123c;
  }
  .crew .role-top {
    color: #15803d;
  }
  .role p {
    margin: 0;
    font-weight: 600;
    color: var(--ink-soft);
    max-width: 460px;
  }
  .role p.small {
    font-size: 0.85rem;
  }
  .secret {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .secret small {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .secret b {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: 1.1;
  }
  .cat {
    font-weight: 700;
    background: #fff;
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 3px 12px;
  }
  .hide {
    border: none;
    background: none;
    color: var(--muted);
    font-weight: 800;
    text-decoration: underline;
  }

  /* ───── clues ───── */
  .sec-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
  }
  .sec-head b {
    font-family: var(--font-display);
    font-size: 1.2rem;
  }
  .sec-head small {
    color: var(--muted);
    font-weight: 800;
  }
  .clue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .clue-list li {
    display: grid;
    grid-template-columns: auto minmax(70px, 140px) 1fr;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 12px;
    transition: border-color 0.2s, background 0.2s;
  }
  .clue-list li.current {
    border-color: #f5b400;
    background: #fffbea;
  }
  .clue-list li.away {
    opacity: 0.5;
  }
  .av {
    font-size: 1.5rem;
  }
  .nm {
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    background: var(--ink);
    color: #fff;
    border-radius: 8px;
    padding: 2px 9px;
    font-weight: 800;
    animation: pop-in 0.3s ease;
  }
  .chip.skip {
    background: var(--line);
    color: var(--muted);
  }
  .chip.typing {
    background: none;
    color: #b45309;
    animation: bob 1s ease-in-out infinite;
  }
  .my-turn {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: 14px;
    background: #fffbea;
    border: 2px solid #f5b400;
    animation: pop-in 0.3s ease;
  }
  .my-turn label {
    font-weight: 800;
  }
  .input-row {
    display: flex;
    gap: 8px;
  }
  .waiting {
    margin: 12px 0 0;
    text-align: center;
    font-weight: 700;
    color: var(--muted);
  }

  /* ───── vote ───── */
  .hint {
    margin: -4px 0 10px;
    color: var(--ink-soft);
    font-weight: 600;
  }
  .vote-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .vote-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 12px 8px 10px;
    border: 3px solid var(--ink);
    border-radius: 16px;
    background: #fff;
    box-shadow: var(--shadow-sm);
    transition: transform 0.1s, background 0.15s;
  }
  .vote-card:hover {
    transform: translateY(-2px);
  }
  .vote-card.on {
    background: #fff1f2;
    border-color: #be123c;
    box-shadow: 0 3px 0 #be123c;
  }
  .vote-card .av {
    font-size: 2.2rem;
  }
  .their-clues {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
    text-align: center;
  }
  .voted {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.7rem;
    font-weight: 800;
    color: #15803d;
  }
  .my-pick {
    margin-top: 4px;
    font-size: 0.75rem;
    font-weight: 800;
    color: #fff;
    background: #be123c;
    border-radius: 999px;
    padding: 1px 8px;
  }

  /* ───── guess ───── */
  .guess {
    text-align: center;
  }
  .guess h3 {
    font-size: 1.4rem;
  }
  .guess p {
    font-weight: 600;
    color: var(--ink-soft);
  }

  /* ───── reveal ───── */
  .reveal {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    animation: pop-in 0.4s ease;
  }
  .reveal.crew {
    background: #ecfdf3;
  }
  .reveal.imp {
    background: #fff1f2;
  }
  .reveal h2 {
    font-size: clamp(1.5rem, 4vw, 2rem);
  }
  .imposters {
    display: flex;
    gap: 16px;
    justify-content: center;
  }
  .imp-person {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .imp-person .av {
    font-size: 3rem;
    animation: bob 1.2s ease-in-out infinite;
  }
  .imp-person b {
    font-family: var(--font-display);
    font-size: 1.2rem;
  }
  .imp-person small {
    color: var(--muted);
    font-weight: 800;
  }
  .the-word {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .the-word small {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .the-word b {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 5vw, 2.4rem);
    text-transform: uppercase;
    color: var(--violet);
    -webkit-text-stroke: 1.5px var(--ink);
    paint-order: stroke fill;
  }
  .cat-chip {
    font-weight: 700;
    font-size: 0.85rem;
    background: #fff;
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 1px 10px;
  }
  .their-guess {
    margin: 0;
    font-weight: 700;
  }
  .votes {
    width: 100%;
    max-width: 420px;
  }
  .votes h4 {
    margin: 0 0 6px;
    font-family: var(--font-display);
  }
  .votes ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .votes li {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 4px 10px;
    border-radius: 10px;
    background: #fff;
    border: 2px solid var(--line);
    font-weight: 700;
  }
  .votes li.hit {
    border-color: var(--green);
  }
  .arrow {
    color: var(--muted);
  }
  .gains {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  .gains span {
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 3px 10px;
    font-weight: 800;
  }
  .gains b {
    color: #15803d;
  }
  .next {
    margin: 0;
    color: var(--muted);
    font-weight: 800;
  }

  @media (max-width: 1100px) {
    .imp-game {
      grid-template-columns: 200px minmax(0, 1fr) 270px;
    }
  }

  /* ───── phones ───── */
  .imp-game.phone {
    height: auto;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }
  .phone .bar {
    position: sticky;
    top: 8px;
    z-index: 20;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
  .phone .round {
    padding: 5px 8px;
  }
  .phone .round small {
    display: none;
  }
  .phone .round b {
    font-size: 1.05rem;
  }
  .phone .phase b {
    font-size: 1.05rem;
  }
  .phone .phase .lbl {
    font-size: 0.6rem;
  }
  .phone .bar-right :global(.btn.icon) {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
  .phone .players {
    padding: 0;
    overflow: visible;
  }
  .phone .stage {
    overflow: visible;
    gap: 8px;
  }
  .phone .stage > .card {
    padding: 12px;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
  .phone .steps li:not(.now) .st {
    display: none;
  }
  .phone .steps li.now {
    flex: 2.4;
  }
  .phone .tip {
    font-size: 0.88rem;
  }
  .phone .clue-list li {
    grid-template-columns: auto minmax(0, 90px) 1fr;
    padding: 5px 8px;
  }
  .phone .vote-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .phone .chat {
    height: 300px;
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
  }
</style>
