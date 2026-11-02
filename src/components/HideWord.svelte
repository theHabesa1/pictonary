<script>
  // 🙈 / 👁 toggle for the word on your own screen (handy when someone's sitting next to you).
  // The choice is remembered on this device.
  import { game, toggleHideWord } from '../lib/game.svelte.js';

  let { light = false } = $props(); // on the dark word-picking overlay
</script>

<button
  type="button"
  class="hide-word"
  class:light
  aria-pressed={game.hideWord}
  title={game.hideWord ? 'Show the word on my screen' : 'Hide the word from people next to me'}
  onclick={toggleHideWord}
>
  {game.hideWord ? '👁 Show' : '🙈 Hide'}
</button>

<style>
  .hide-word {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: none;
    line-height: 1.5;
    vertical-align: middle;
    cursor: pointer;
  }
  .hide-word:hover {
    background: var(--green-soft);
  }
  .hide-word.light {
    border-color: #fff;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
  .hide-word.light:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>
