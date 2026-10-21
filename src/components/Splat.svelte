<script>
  // 💦 Ink Splat power-up: messy blobs over the board for a few seconds.
  // Anonymous on purpose: you never learn who splatted you.
  let { seed, until } = $props();

  // Small seeded random so each splat has its own shape.
  function rng(s) {
    let x = Math.floor(s * 2147483646) + 1;
    return () => (x = (x * 16807) % 2147483647) / 2147483647;
  }
  // The shape is fixed for the splat's lifetime (the parent re-creates us per splat).
  // svelte-ignore state_referenced_locally
  const r = rng(seed);
  const COLORS = ['#1d1442', '#5b3df5', '#db2777', '#0d9488', '#ea580c', '#16a34a'];

  /** A wobbly closed blob path around (0,0). */
  function blob() {
    const n = 10;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const rad = 32 + r() * 22;
      return [Math.cos(a) * rad, Math.sin(a) * rad];
    });
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M ${mid(pts[n - 1], pts[0]).join(' ')}`;
    for (let i = 0; i < n; i++) d += ` Q ${pts[i].join(' ')} ${mid(pts[i], pts[(i + 1) % n]).join(' ')}`;
    return d + ' Z';
  }
  const blobs = Array.from({ length: 7 }, (_, i) => ({
    x: 8 + r() * 84,
    y: 8 + r() * 84,
    size: 22 + r() * 30,
    rot: r() * 360,
    color: COLORS[Math.floor(r() * COLORS.length)],
    path: blob(),
    drops: Array.from({ length: 4 }, () => ({ x: (r() - 0.5) * 110, y: (r() - 0.5) * 110, r: 3 + r() * 6 })),
    delay: i * 0.06,
  }));
  // svelte-ignore state_referenced_locally
  const ms = Math.max(800, until - Date.now());
</script>

<div class="splat" style:--ms="{ms}ms" aria-live="polite">
  {#each blobs as b}
    <svg
      viewBox="-70 -70 140 140"
      style:left="{b.x}%"
      style:top="{b.y}%"
      style:width="{b.size}%"
      style:--rot="{b.rot}deg"
      style:animation-delay="{b.delay}s"
      aria-hidden="true"
    >
      <path d={b.path} fill={b.color} />
      {#each b.drops as d}<circle cx={d.x} cy={d.y} r={d.r} fill={b.color} />{/each}
    </svg>
  {/each}
  <div class="who">💦 You got splatted!</div>
</div>

<style>
  .splat {
    position: absolute;
    inset: 0;
    z-index: 7;
    pointer-events: none;
    overflow: hidden;
    animation: fade-out var(--ms) ease forwards;
  }
  svg {
    position: absolute;
    aspect-ratio: 1;
    transform: translate(-50%, -50%) rotate(var(--rot)) scale(0);
    animation: splat-in 0.35s cubic-bezier(0.2, 1.6, 0.4, 1) forwards;
    opacity: 0.93;
  }
  .who {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: #fff;
    font-weight: 800;
    padding: 5px 14px;
    border-radius: 999px;
    white-space: nowrap;
    animation: pop-in 0.3s ease;
  }
  @keyframes splat-in {
    to {
      transform: translate(-50%, -50%) rotate(var(--rot)) scale(1);
    }
  }
  @keyframes fade-out {
    0%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
