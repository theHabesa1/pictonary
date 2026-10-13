<script>
  import { BRUSH_SIZES, PALETTE } from '../../shared/constants.js';
  import * as board from '../lib/board.js';
  import { tools } from '../lib/tools.svelte.js';

  function pickColor(c) {
    tools.color = c;
    if (tools.tool === 'eraser') tools.tool = 'brush';
  }

  function onKey(e) {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      board.undo();
    } else if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    } else if (k === 'b') tools.tool = 'brush';
    else if (k === 'e') tools.tool = 'eraser';
    else if (k === 'f' || k === 'g') tools.tool = 'fill';
    else if (k >= '1' && k <= '5') tools.size = BRUSH_SIZES[+k - 1];
  }

  const tip = (label, key) => `${label} (${key})`;
</script>

<svelte:window onkeydown={onKey} />

<div class="toolbar card">
  <div class="colors" role="radiogroup" aria-label="Colors">
    <label class="custom" title="Any color" style:background={tools.color}>
      <input type="color" value={tools.color} oninput={(e) => pickColor(e.currentTarget.value)} />
      🎨
    </label>
    {#each PALETTE as c}
      <button
        class="swatch"
        class:on={tools.color === c && tools.tool !== 'eraser'}
        style:background={c}
        role="radio"
        aria-checked={tools.color === c}
        aria-label={c}
        onclick={() => pickColor(c)}
      ></button>
    {/each}
  </div>

  <div class="group sizes" role="radiogroup" aria-label="Brush size">
    {#each BRUSH_SIZES as sz, i}
      <button class="tool size" class:on={tools.size === sz} title={tip('Size', i + 1)} onclick={() => (tools.size = sz)}>
        <span style:width="{4 + i * 5}px" style:height="{4 + i * 5}px" style:background={tools.tool === 'eraser' ? '#bbb' : tools.color}></span>
      </button>
    {/each}
  </div>

  <div class="group">
    <button class="tool" class:on={tools.tool === 'brush'} title={tip('Brush', 'B')} onclick={() => (tools.tool = 'brush')}>🖌️</button>
    <button class="tool" class:on={tools.tool === 'eraser'} title={tip('Eraser', 'E')} onclick={() => (tools.tool = 'eraser')}>🧽</button>
    <button class="tool" class:on={tools.tool === 'fill'} title={tip('Fill bucket', 'F')} onclick={() => (tools.tool = 'fill')}>🪣</button>
  </div>

  <div class="group">
    <button class="tool" title={tip('Undo', 'Ctrl+Z')} onclick={() => board.undo()}>↩️</button>
    <button class="tool" title="Clear canvas" onclick={() => board.clear()}>🗑️</button>
  </div>
</div>

<style>
  .toolbar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    flex-wrap: wrap;
    justify-content: center;
    box-shadow: var(--shadow-sm);
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(11, 24px);
    grid-auto-rows: 24px;
    gap: 3px;
  }
  .custom {
    grid-row: span 2;
    grid-column: span 1;
    border: 2px solid var(--ink);
    border-radius: 8px;
    display: grid;
    place-items: center;
    font-size: 0.85rem;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 2px solid rgba(29, 20, 66, 0.25);
    padding: 0;
    transition: transform 0.1s;
  }
  .swatch:hover {
    transform: scale(1.15);
  }
  .swatch.on {
    border: 3px solid var(--ink);
    transform: scale(1.12);
    box-shadow: 0 0 0 2px #fff inset;
  }
  .group {
    display: flex;
    gap: 4px;
    padding: 3px;
    background: #f4f1ff;
    border-radius: 12px;
  }
  .tool {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 2px solid transparent;
    background: transparent;
    font-size: 1.25rem;
    display: grid;
    place-items: center;
    padding: 0;
    transition: background 0.12s, transform 0.1s;
  }
  .tool:hover {
    background: #fff;
  }
  .tool:active {
    transform: scale(0.92);
  }
  .tool.on {
    background: var(--yellow);
    border-color: var(--ink);
  }
  .size span {
    display: block;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  @media (max-width: 600px) {
    .toolbar {
      gap: 6px;
      padding: 6px;
    }
    .colors {
      grid-template-columns: repeat(11, minmax(0, 1fr));
      grid-auto-rows: 22px;
      width: 100%;
    }
    .swatch {
      width: 100%;
      height: 22px;
    }
    .tool {
      width: 36px;
      height: 36px;
      font-size: 1.1rem;
    }
  }
</style>
