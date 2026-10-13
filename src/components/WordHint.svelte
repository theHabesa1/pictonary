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
  const fs = $derived(mask.length <= 8 ? 1.7 : mask.length <= 12 ? 1.35 : mask.length <= 16 ? 1.1 : 0.92);
</script>

<div class="hint">
  {#if s.phase === 'choosing'}
    <span class="lbl">{isDrawer ? 'Your turn!' : 'Get ready…'}</span>
    <span class="msg">{isDrawer ? '✏️ Pick a word to draw' : `✏️ ${drawer?.name ?? 'Someone'} is choosing`}</span>
  {:else if s.phase === 'drawing' && turn}
    {#if isDrawer}
      <span class="lbl">Draw this</span>
      <span class="word" style:--fs="{fs}rem">{turn.word}</span>
    {:else if me?.guessed}
      <span class="lbl ok">You got it! 🎉</span>
      <span class="word ok" style:--fs="{fs}rem">{turn.word}</span>
    {:else}
      <span class="lbl">
        {#if s.settings.mode === 'teams' && !turn.canGuess}
          Watch — {TEAMS[turn.team].name} are guessing
        {:else}
          Guess the word
        {/if}
        <span class="count">{lengths}</span>
        {#if turn.hintsTotal > 0}
          <span class="bulbs" title="Letter hints revealed">
            {#each Array(turn.hintsTotal) as _, i}<span class:lit={i < turn.hintsGiven}>💡</span>{/each}
          </span>
        {/if}
      </span>
      <span class="slots" style:--fs="{fs}rem" aria-label="Word with {mask.length} characters">
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
    <span class="word" style:--fs="{fs}rem">{turn.reveal.word}</span>
  {:else if s.phase === 'gameOver'}
    <span class="msg">🏁 Game over!</span>
  {:else}
    <span class="msg">Next turn…</span>
  {/if}
</div>

<style>
  .hint {
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
    flex-wrap: wrap;
    justify-content: center;
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
    font-size: 1.25rem;
  }
  .word {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--fs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .word.ok {
    color: #15803d;
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: calc(var(--fs) * 0.18);
    row-gap: 4px;
  }
  .slot {
    width: calc(var(--fs) * 0.95);
    height: calc(var(--fs) * 1.25);
    border-bottom: 4px solid var(--ink);
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--fs);
    text-transform: uppercase;
    line-height: 1;
  }
  .slot.shown {
    color: var(--violet);
    animation: pop-in 0.45s ease;
  }
  .gap {
    width: calc(var(--fs) * 0.6);
  }
  @media (max-width: 860px) {
    .hint {
      --scale: 0.72;
    }
    .slots,
    .word {
      zoom: 0.75;
    }
    .msg {
      font-size: 0.95rem;
    }
    .lbl {
      font-size: 0.62rem;
      gap: 4px;
    }
  }
</style>
