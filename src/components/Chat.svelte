<script>
  import { tick } from 'svelte';
  import { REACTIONS, TEAMS, isTeams } from '../../shared/constants.js';
  import { game, send } from '../lib/game.svelte.js';
  import PowerBar from './PowerBar.svelte';

  // compact: no header (lobby, phones). reactions / cards: show the 😀 / 🎴 buttons in the
  // input row (phones), which open a tray above the input.
  let { compact = false, reactions = false, cards = false } = $props();

  let text = $state('');
  let tray = $state(null); // null | 'react' | 'cards'
  $effect(() => {
    if ((tray === 'react' && !reactions) || (tray === 'cards' && !cards)) tray = null;
  });
  const toggle = (name) => (tray = tray === name ? null : name);
  const cardCount = $derived(Object.values(game.state?.cards ?? {}).reduce((a, b) => a + b, 0));
  let list;
  let stick = true;

  const s = $derived(game.state);
  const turn = $derived(s?.turn);
  const me = $derived(s?.players.find((p) => p.id === s.me));
  const drawing = $derived(s?.phase === 'drawing');
  const isDrawer = $derived(drawing && turn?.drawerId === s.me);
  const teams = $derived(s ? isTeams(s.settings) : false);

  const placeholder = $derived.by(() => {
    if (s?.phase === 'vote') return 'Who is the imposter? Discuss! 🕵️';
    if (s?.imp && s.phase !== 'impReveal') return 'Chat — but never say the secret word! 🤫';
    if (!drawing) return 'Say something nice 💬';
    if (isDrawer) return "You're drawing! Only players who guessed see this";
    if (me?.guessed) return 'Chat with players who got it 🤫';
    if (teams && !turn?.canGuess) return "Not your team's turn — chat away";
    return 'Type your guess here… ✍️';
  });

  function onScroll() {
    stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  $effect(() => {
    void game.messages.length;
    if (stick) tick().then(() => list && (list.scrollTop = list.scrollHeight));
  });

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send('chat', t);
    text = '';
    stick = true;
  }
</script>

<div class="chat" class:compact>
  {#if !compact}
    <div class="head">
      <b>💬 Chat &amp; guesses</b>
    </div>
  {/if}
  <ul class="msgs scroll-thin" bind:this={list} onscroll={onScroll} aria-live="polite">
    {#each game.messages as m (m.id)}
      {#if m.type === 'chat'}
        <li class="msg" class:secret={m.channel === 'guessed'} class:mine={m.pid === s?.me}>
          <span class="av">{m.avatar}</span>
          <span class="body">
            <b style:color={teams ? TEAMS[m.team]?.color : null}>{m.name}</b>
            {#if m.channel === 'guessed'}<span class="lock" title="Only visible to players who know the word">🤫</span>{/if}
            <span class="txt">{m.text}</span>
          </span>
        </li>
      {:else}
        <li class="sys {m.type}">{m.text}</li>
      {/if}
    {/each}
  </ul>
  {#if tray === 'react'}
    <div class="react-row">
      {#each REACTIONS as r}
        <button type="button" onclick={() => send('react', r)} aria-label="React {r}">{r}</button>
      {/each}
    </div>
  {:else if tray === 'cards'}
    <div class="card-row"><PowerBar compact /></div>
  {/if}
  <form class="send" onsubmit={submit}>
    {#if cards}
      <button
        type="button"
        class="react-toggle"
        class:on={tray === 'cards'}
        aria-label="Power-up cards"
        aria-expanded={tray === 'cards'}
        onclick={() => toggle('cards')}
        >🎴{#if cardCount}<span class="badge">{cardCount}</span>{/if}</button
      >
    {/if}
    {#if reactions}
      <button
        type="button"
        class="react-toggle"
        class:on={tray === 'react'}
        aria-label="Reactions"
        aria-expanded={tray === 'react'}
        onclick={() => toggle('react')}>😀</button
      >
    {/if}
    <input
      class="input"
      bind:value={text}
      maxlength="120"
      {placeholder}
      autocomplete="off"
      autocapitalize="off"
      enterkeyhint="send"
      aria-label="Chat message or guess"
    />
    <button class="btn green small" type="submit" aria-label="Send">➤</button>
  </form>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .head {
    padding: 10px 14px;
    border-bottom: 2px solid var(--line);
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .msgs {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .msg {
    display: flex;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 10px;
    font-size: 0.95rem;
    line-height: 1.3;
    animation: slide 0.18s ease;
  }
  .msg:nth-child(odd) {
    background: #faf8ff;
  }
  .msg.secret {
    background: var(--green-soft);
  }
  .av {
    flex: none;
  }
  .body {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .body b {
    margin-right: 4px;
  }
  .lock {
    margin-right: 4px;
  }
  .sys {
    text-align: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
    padding: 3px 6px;
    animation: slide 0.18s ease;
  }
  .sys.join {
    color: #16a34a;
  }
  .sys.leave {
    color: #e11d48;
  }
  .sys.correct {
    color: #fff;
    background: var(--green);
    border-radius: 10px;
    padding: 6px 8px;
    font-size: 0.92rem;
    animation: pop-in 0.35s ease;
  }
  .sys.close {
    color: #9a3412;
    background: #ffedd5;
    border: 2px dashed var(--orange);
    border-radius: 10px;
    padding: 6px 8px;
  }
  .sys.private {
    color: #5b21b6;
    background: #ede9fe;
    border-radius: 10px;
    padding: 6px 8px;
  }
  .send {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 2px solid var(--line);
  }
  .send .input {
    padding: 10px 12px;
    font-size: 1rem;
  }
  .send .btn {
    flex: none;
    width: 46px;
    font-size: 1.1rem;
  }
  .react-toggle {
    flex: none;
    width: 42px;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: #fff;
    font-size: 1.25rem;
    padding: 0;
  }
  .react-toggle {
    position: relative;
  }
  .react-toggle.on {
    border-color: var(--ink);
    background: var(--yellow);
  }
  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--violet);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 900;
    display: grid;
    place-items: center;
  }
  .card-row {
    padding: 6px 8px 0;
    border-top: 2px solid var(--line);
    animation: slide 0.15s ease;
  }
  .sys.power {
    color: #5b21b6;
    background: #ede9fe;
    border-radius: 10px;
    padding: 5px 8px;
    animation: pop-in 0.35s ease;
  }
  .react-row {
    display: flex;
    justify-content: space-around;
    padding: 4px 8px 0;
    border-top: 2px solid var(--line);
    animation: slide 0.15s ease;
  }
  .react-row button {
    border: none;
    background: none;
    font-size: 1.5rem;
    width: 44px;
    height: 40px;
    border-radius: 10px;
  }
  .react-row button:active {
    transform: scale(0.85);
    background: #f1edff;
  }
  .compact .msgs {
    padding: 6px 8px;
  }
  .compact .msg {
    font-size: 0.9rem;
    padding: 3px 5px;
  }
  .compact .sys {
    font-size: 0.8rem;
    padding: 2px 4px;
  }
  .compact .send {
    padding: 6px;
  }
  .compact .react-row + .send,
  .compact .card-row + .send {
    border-top: none;
  }
  @keyframes slide {
    from {
      transform: translateY(6px);
      opacity: 0;
    }
  }
</style>
