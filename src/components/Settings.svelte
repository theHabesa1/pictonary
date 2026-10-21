<script>
  import { CATEGORY_META, DRAW_TIMES, GAMES, TEAMS, parseCustomWords } from '../../shared/constants.js';
  import { send } from '../lib/game.svelte.js';

  let { settings, editable, wordPool = 0 } = $props();

  const update = (patch) => editable && send('settings:update', patch);

  // Custom words are edited locally and sent after a short pause.
  let custom = $state('');
  let editingCustom = $state(false);
  let timer;
  $effect(() => {
    if (!editingCustom) custom = settings.customWords;
  });
  function onCustomInput() {
    clearTimeout(timer);
    timer = setTimeout(() => update({ customWords: custom }), 500);
  }
  const customCount = $derived(parseCustomWords(custom).length);

  const allCats = $derived(settings.categories.length === 0);
  function toggleCat(id) {
    const current = allCats ? CATEGORY_META.map((c) => c.id) : settings.categories;
    let next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    if (!next.length) next = [id === CATEGORY_META[0].id ? CATEGORY_META[1].id : CATEGORY_META[0].id];
    update({ categories: next });
  }

  const imposter = $derived(settings.game === 'imposter');
  const cards = $derived(settings.game === 'cards');
</script>

<div class="settings" class:locked={!editable}>
  <div class="row full">
    <span class="label">Game</span>
    <div class="seg games">
      {#each GAMES as g}
        <button class:on={settings.game === g.id} disabled={!editable} onclick={() => update({ game: g.id })}>
          <span>{g.emoji}</span>
          <b>{g.name}</b>
          <small>{g.desc}</small>
        </button>
      {/each}
    </div>
  </div>

  {#if imposter}
    <div class="row">
      <label class="label" for="clue-rounds">Clue rounds</label>
      <select id="clue-rounds" class="input" value={settings.clueRounds} disabled={!editable} onchange={(e) => update({ clueRounds: +e.currentTarget.value })}>
        {#each [1, 2, 3] as n}<option value={n}>{n} clue{n > 1 ? 's' : ''} each</option>{/each}
      </select>
    </div>
    <div class="row">
      <label class="label" for="clue-time">Time per clue</label>
      <select id="clue-time" class="input" value={settings.clueTime} disabled={!editable} onchange={(e) => update({ clueTime: +e.currentTarget.value })}>
        {#each [15, 20, 30, 45, 60] as t}<option value={t}>{t} seconds</option>{/each}
      </select>
    </div>
    <div class="row">
      <label class="label" for="vote-time">Voting time</label>
      <select id="vote-time" class="input" value={settings.voteTime} disabled={!editable} onchange={(e) => update({ voteTime: +e.currentTarget.value })}>
        {#each [30, 45, 60, 90, 120] as t}<option value={t}>{t} seconds</option>{/each}
      </select>
    </div>
    <div class="row">
      <span class="label">Imposters</span>
      <div class="seg">
        <button class:on={settings.imposters === 1} disabled={!editable} onclick={() => update({ imposters: 1 })}>🕵️ 1</button>
        <button class:on={settings.imposters === 2} disabled={!editable} onclick={() => update({ imposters: 2 })} title="Needs 6+ players">🕵️🕵️ 2 <small>(6+)</small></button>
      </div>
    </div>
  {:else if cards}
    <div class="row">
      <label class="label" for="turn-time">Time per turn</label>
      <select id="turn-time" class="input" value={settings.turnTime} disabled={!editable} onchange={(e) => update({ turnTime: +e.currentTarget.value })}>
        {#each [15, 20, 30, 45, 60] as t}<option value={t}>{t} seconds</option>{/each}
      </select>
    </div>
    <div class="row">
      <label class="label" for="hand-size">Cards each</label>
      <select id="hand-size" class="input" value={settings.handSize} disabled={!editable} onchange={(e) => update({ handSize: +e.currentTarget.value })}>
        {#each [5, 7, 10] as n}<option value={n}>{n} cards</option>{/each}
      </select>
    </div>
    <div class="row full">
      <span class="label">House rule</span>
      <label class="toggle">
        <input type="checkbox" checked={settings.stacking} disabled={!editable} onchange={(e) => update({ stacking: e.currentTarget.checked })} />
        <span class="track"></span>
        <span class="toggle-text">Stacking: answer a +2 with a +2 (or +4 with +4) to pass it on 😈</span>
      </label>
    </div>
  {:else}
  <div class="row full">
    <span class="label">Game mode</span>
    <div class="seg mode">
      <button class:on={settings.mode === 'solo'} disabled={!editable} onclick={() => update({ mode: 'solo' })}>
        <span>🙋</span>
        <b>Every player</b>
        <small>Everyone guesses, everyone scores</small>
      </button>
      <button class:on={settings.mode === 'teams'} disabled={!editable} onclick={() => update({ mode: 'teams' })}>
        <span>👨‍👩‍👧‍👦</span>
        <b>Teams</b>
        <small>Your team guesses your drawing</small>
      </button>
    </div>
  </div>

  {#if settings.mode === 'teams'}
    <div class="row">
      <span class="label">Teams</span>
      <div class="seg">
        {#each [2, 3, 4] as n}
          <button class:on={settings.teamCount === n} disabled={!editable} onclick={() => update({ teamCount: n })}>
            {TEAMS.slice(0, n).map((t) => t.emoji).join('')}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label">Steals</span>
      <label class="toggle">
        <input
          type="checkbox"
          checked={settings.allowSteals}
          disabled={!editable}
          onchange={(e) => update({ allowSteals: e.currentTarget.checked })}
        />
        <span class="track"></span>
        <span class="toggle-text">Other teams can steal 🦝</span>
      </label>
    </div>
  {/if}

  <div class="row full">
    <span class="label">Power-up cards</span>
    <label class="toggle">
      <input
        type="checkbox"
        checked={settings.powerUps}
        disabled={!editable}
        onchange={(e) => update({ powerUps: e.currentTarget.checked })}
      />
      <span class="track"></span>
      <span class="toggle-text">🎴 Signed-in players can play cards they've earned with ⭐ stars</span>
    </label>
  </div>
  {/if}

  <div class="row">
    <label class="label" for="rounds">Rounds</label>
    <select id="rounds" class="input" value={settings.rounds} disabled={!editable} onchange={(e) => update({ rounds: +e.currentTarget.value })}>
      {#each Array.from({ length: 10 }, (_, i) => i + 1) as n}<option value={n}>{n}</option>{/each}
    </select>
  </div>

  {#if !imposter && !cards}
  <div class="row">
    <label class="label" for="time">Draw time</label>
    <select id="time" class="input" value={settings.drawTime} disabled={!editable} onchange={(e) => update({ drawTime: +e.currentTarget.value })}>
      {#each DRAW_TIMES as t}<option value={t}>{t} seconds</option>{/each}
    </select>
  </div>

  <div class="row">
    <label class="label" for="hints">Letter hints</label>
    <select id="hints" class="input" value={settings.hints} disabled={!editable} onchange={(e) => update({ hints: +e.currentTarget.value })}>
      <option value={0}>No hints</option>
      {#each [1, 2, 3, 4, 5] as n}<option value={n}>Up to {n} letter{n > 1 ? 's' : ''}</option>{/each}
    </select>
  </div>

  <div class="row">
    <label class="label" for="choices">Word choices</label>
    <select id="choices" class="input" value={settings.wordChoices} disabled={!editable} onchange={(e) => update({ wordChoices: +e.currentTarget.value })}>
      {#each [1, 2, 3, 4, 5] as n}<option value={n}>{n} word{n > 1 ? 's' : ''}</option>{/each}
    </select>
  </div>
  {/if}

  {#if !cards}
  <div class="row full">
    <span class="label">Difficulty</span>
    <div class="seg">
      {#each [['easy', '🟢 Easy'], ['medium', '🟡 Medium'], ['hard', '🔴 Hard'], ['mixed', '🎲 Mixed']] as [v, l]}
        <button class:on={settings.difficulty === v} disabled={!editable} onclick={() => update({ difficulty: v })}>{l}</button>
      {/each}
    </div>
  </div>

  <div class="row full">
    <span class="label">
      Word categories
      {#if wordPool}<small class="pool">📚 {wordPool.toLocaleString()} words in play</small>{/if}
    </span>
    <div class="cats">
      {#each CATEGORY_META as c}
        {@const on = allCats || settings.categories.includes(c.id)}
        <button class="cat" class:on disabled={!editable} onclick={() => toggleCat(c.id)}>{c.emoji} {c.label}</button>
      {/each}
    </div>
  </div>

  <div class="row full">
    <label class="label" for="custom">Custom words <small>({customCount}) — family names, inside jokes, any language!</small></label>
    <textarea
      id="custom"
      class="input"
      rows="2"
      placeholder="Uncle Bob, our dog Max, birthday cake, …"
      disabled={!editable}
      bind:value={custom}
      oninput={onCustomInput}
      onfocus={() => (editingCustom = true)}
      onblur={() => {
        editingCustom = false;
        clearTimeout(timer);
        update({ customWords: custom });
      }}
    ></textarea>
    {#if customCount > 0}
      <label class="check">
        <input
          type="checkbox"
          checked={settings.customOnly}
          disabled={!editable}
          onchange={(e) => update({ customOnly: e.currentTarget.checked })}
        />
        Use only my custom words
      </label>
    {/if}
  </div>
  {/if}
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .row {
    min-width: 0;
  }
  .row.full {
    grid-column: 1 / -1;
  }
  .label small {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }
  .label .pool {
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--green-soft);
    color: #15803d;
    font-weight: 800;
  }
  select.input {
    padding: 9px 10px;
    font-size: 1rem; /* 16px+ stops iPhones zooming in on tap */
    cursor: pointer;
  }
  .locked select.input,
  .locked textarea {
    cursor: default;
    background: #f7f5fc;
  }
  textarea.input {
    resize: vertical;
    font-weight: 600;
    min-height: 56px;
  }
  .seg {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .seg button {
    flex: 1;
    padding: 9px 10px;
    border: 2px solid var(--ink);
    border-radius: 12px;
    background: #fff;
    font-weight: 800;
    font-size: 0.95rem;
    transition: background 0.15s, transform 0.1s;
  }
  .seg button.on {
    background: var(--yellow);
    box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12);
  }
  .seg button:not(:disabled):hover {
    transform: translateY(-1px);
  }
  .locked .seg button:not(.on) {
    opacity: 0.5;
  }
  .seg button:disabled {
    cursor: default;
  }
  .games button,
  .mode button {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 10px;
    text-align: left;
    align-items: center;
    padding: 10px 12px;
  }
  .games span,
  .mode span {
    grid-row: span 2;
    font-size: 1.8rem;
  }
  .games b,
  .mode b {
    font-family: var(--font-display);
    font-size: 1.1rem;
  }
  .seg.games {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
  .games small {
    font-size: 0.76rem;
    line-height: 1.25;
  }
  .games button.on {
    background: #e9e3ff;
    border-color: var(--violet);
    box-shadow: inset 0 -3px 0 rgba(91, 61, 245, 0.25);
  }
  .games small,
  .mode small {
    font-weight: 600;
    color: var(--ink-soft);
    font-size: 0.8rem;
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cat {
    border: 2px solid var(--line);
    background: #fff;
    border-radius: 999px;
    padding: 6px 12px;
    font-weight: 800;
    font-size: 0.88rem;
    color: var(--muted);
    transition: all 0.15s;
  }
  .cat.on {
    border-color: var(--ink);
    background: #e9e3ff;
    color: var(--ink);
  }
  .cat:disabled {
    cursor: default;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-weight: 700;
    padding-top: 6px;
  }
  .toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    flex: none;
    width: 48px;
    height: 28px;
    border-radius: 999px;
    border: 2px solid var(--ink);
    background: var(--line);
    position: relative;
    transition: background 0.2s;
  }
  .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid var(--ink);
    transition: transform 0.2s;
  }
  .toggle input:checked + .track {
    background: var(--green);
  }
  .toggle input:checked + .track::after {
    transform: translateX(20px);
  }
  .toggle input:focus-visible + .track {
    outline: 3px solid var(--yellow);
  }
  .toggle-text {
    font-size: 0.9rem;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    font-weight: 700;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--violet);
  }
  @media (max-width: 480px) {
    .settings {
      grid-template-columns: 1fr;
    }
    .row {
      grid-column: 1 / -1;
    }
  }
</style>
