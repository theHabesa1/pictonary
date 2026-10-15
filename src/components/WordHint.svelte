<script>
  import { TEAMS } from '../../shared/constants.js';

  let { state: s, drawer, isDrawer } = $props();

  const turn = $derived(s.turn);
  const me = $derived(s.players.find((p) => p.id === s.me));
  const mask = $derived(turn?.mask ?? []);
  // "5" for one word, "3 4" for two words, etc.
  const lengths = $derived(
    turn?.mask
      ? turn.mask
          .map((c) => (c === ' ' ? ' ' : 'x'))
          .join('')
          .split(' ')
          .filter(Boolean)
          .map((w) => w.length)
          .join(' ')
      : '',
  );
  const shownWord = $derived(turn?.reveal?.word ?? turn?.word ?? '');
  // Letter count drives the size: the blanks always fit the available width.
  const n = $derived(Math.max(5, mask.length || Array.from(shownWord).length));
</script>

<div class="hint" style:--n={n}>
  {#if s.phase === 'choosing'}
    <span class="lbl">{isDrawer ? 'Your turn!' : 'Get ready…'}</span>
    <span class="msg">{isDrawer ? '✏️ Pick a word to draw' : `✏️ ${drawer?.name ?? 'Someone'} is choosing`}</span>
  {:else if s.phase === 'drawing' && turn}
    {#if isDrawer}
      <span class="lbl">Draw this</span>
      <span class="word">{turn.word}</span>
    {:else if me?.guessed}
      <span class="lbl ok">You got it! 🎉</span>
      <span class="word ok">{turn.word}</span>
    {:else}
      <span class="lbl">
        <span class="lbl-text">
          {#if s.settings.mode === 'teams' && !turn.canGuess}
            {TEAMS[turn.team].name} guessing
          {:else}
            Guess the word
          {/if}
        </span>
        <span class="count">{lengths}</span>
        {#if turn.category}<span class="clue" title="Category Clue card">{turn.category}</span>{/if}
        {#if turn.doubled}<span class="clue dbl" title="Double Points card">✌️ 2×</span>{/if}
        {#if turn.hintsTotal > 0}
          <span class="bulbs" title="Letter hints revealed">
            {#each Array(turn.hintsTotal) as _, i}<span class:lit={i < turn.hintsGiven}>💡</span>{/each}
          </span>
        {/if}
      </span>
      <span class="slots" aria-label="Word with {mask.length} characters">
        {#each mask as ch, i (i)}
          {#if ch === ' '}
            <span class="gap"></span>
          {:else if ch === null}
            <span class="slot"></span>
          {:else}
            {#key ch}<span class="slot shown">{ch}</span>{/key}
          {/if}
        {/each}
      </span>
    {/if}
  {:else if s.phase === 'turnEnd' && turn?.reveal?.word}
    <span class="lbl">The word was</span>
    <span class="word">{turn.reveal.word}</span>
  {:else if s.phase === 'gameOver'}
    <span class="msg">🏁 Game over!</span>
  {:else}
    <span class="msg">Next turn…</span>
  {/if}
</div>

<style>
  .hint {
    container-type: inline-size;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-align: center;
    min-width: 0;
  }
  .lbl {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    white-space: nowrap;
  }
  .lbl.ok {
    color: #15803d;
  }
  .count {
    background: var(--ink);
    color: #fff;
    border-radius: 6px;
    padding: 0 6px;
    letter-spacing: 0.05em;
  }
  .bulbs {
    display: flex;
  }
  .clue {
    background: #ede9fe;
    color: #5b21b6;
    border-radius: 6px;
    padding: 0 6px;
    text-transform: none;
    letter-spacing: 0;
    animation: pop-in 0.35s ease;
  }
  .clue.dbl {
    background: #dcfce7;
    color: #15803d;
  }
  .bulbs span {
    filter: grayscale(1) opacity(0.35);
    font-size: 0.8rem;
    transition: filter 0.3s;
  }
  .bulbs span.lit {
    filter: none;
  }
  .msg {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(0.9rem, 6.5cqi, 1.25rem);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .word {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: max(0.95rem, min(1.7rem, calc(100cqi / (var(--n) * 0.85))));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .word.ok {
    color: #15803d;
  }
  .slots {
    --size: max(0.85rem, min(1.7rem, calc(100cqi / (var(--n) * 1.2))));
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: calc(var(--size) * 0.18);
    row-gap: 4px;
  }
  .slot {
    width: calc(var(--size) * 0.95);
    height: calc(var(--size) * 1.25);
    border-bottom: 3px solid var(--ink);
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--size);
    text-transform: uppercase;
    line-height: 1;
  }
  .slot.shown {
    color: var(--violet);
    animation: pop-in 0.45s ease;
  }
  .gap {
    width: calc(var(--size) * 0.6);
  }
  @container (max-width: 260px) {
    .lbl {
      font-size: 0.62rem;
      gap: 5px;
    }
    .lbl-text {
      display: none;
    }
  }
</style>
