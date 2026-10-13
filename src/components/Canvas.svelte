<script>
  import { onMount } from 'svelte';
  import { CANVAS_H, CANVAS_W } from '../../shared/constants.js';
  import * as board from '../lib/board.js';
  import { tools } from '../lib/tools.svelte.js';

  let { canDraw = false } = $props();

  let canvas;
  let scale = $state(1); // CSS px per canvas px
  let cursor = $state({ x: 0, y: 0, show: false });
  let drawing = false;
  let last = [0, 0];

  onMount(() => {
    board.attach(canvas);
    const ro = new ResizeObserver(() => (scale = canvas.clientWidth / CANVAS_W));
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      board.detach();
    };
  });

  // Turn ended while the pen was down.
  $effect(() => {
    if (!canDraw && drawing) stop();
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * CANVAS_W),
      Math.round(((e.clientY - r.top) / r.height) * CANVAS_H),
    ];
  }

  function onDown(e) {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const [x, y] = toCanvas(e);
    if (tools.tool === 'fill') {
      board.fill(x, y, tools.color);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = [x, y];
    board.beginStroke(x, y, tools.tool === 'eraser' ? '#ffffff' : tools.color, tools.size);
  }

  function onMove(e) {
    if (canDraw && e.pointerType !== 'touch') {
      const r = canvas.getBoundingClientRect();
      cursor = { x: e.clientX - r.left, y: e.clientY - r.top, show: true };
    }
    if (!drawing) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = toCanvas(ev);
      if (Math.hypot(x - last[0], y - last[1]) < 2.5) continue;
      last = [x, y];
      board.extendStroke(x, y);
    }
  }

  function stop() {
    if (!drawing) return;
    drawing = false;
    board.endStroke();
  }

  const cursorSize = $derived(Math.max(6, (tools.tool === 'fill' ? 14 : tools.size) * scale));
</script>

<div class="wrap" class:can-draw={canDraw} class:fill-tool={canDraw && tools.tool === 'fill'}>
  <canvas
    bind:this={canvas}
    width={CANVAS_W}
    height={CANVAS_H}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={stop}
    onpointercancel={stop}
    onpointerleave={() => (cursor.show = false)}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="Drawing board"
  ></canvas>
  {#if canDraw && cursor.show && tools.tool !== 'fill'}
    <div
      class="cursor"
      style:left="{cursor.x}px"
      style:top="{cursor.y}px"
      style:width="{cursorSize}px"
      style:height="{cursorSize}px"
      style:background={tools.tool === 'eraser' ? '#fff' : tools.color}
    ></div>
  {/if}
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .can-draw canvas {
    cursor: none;
  }
  .fill-tool canvas {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ctext y='26' font-size='24'%3E🪣%3C/text%3E%3C/svg%3E") 4 26, crosshair;
  }
  .cursor {
    position: absolute;
    pointer-events: none;
    border-radius: 50%;
    border: 2px solid rgba(29, 20, 66, 0.85);
    box-shadow: 0 0 0 1px #fff;
    transform: translate(-50%, -50%);
    opacity: 0.85;
  }
</style>
