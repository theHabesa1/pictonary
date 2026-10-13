<script>
  let { seconds, total } = $props();
  const R = 20;
  const C = 2 * Math.PI * R;
  const frac = $derived(total ? Math.min(1, seconds / total) : 0);
  const urgent = $derived(seconds <= 10);
</script>

<div class="timer" class:urgent role="timer" aria-label="{seconds} seconds left">
  <svg viewBox="0 0 50 50" aria-hidden="true">
    <circle cx="25" cy="25" r={R} class="bg" />
    <circle cx="25" cy="25" r={R} class="fg" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
  </svg>
  <span>{seconds}</span>
</div>

<style>
  .timer {
    position: relative;
    width: 50px;
    height: 50px;
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 6;
  }
  .bg {
    stroke: var(--line);
    fill: #fff;
  }
  .fg {
    stroke: var(--green);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s linear, stroke 0.3s;
  }
  .urgent .fg {
    stroke: var(--red);
  }
  span {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.15rem;
  }
  .urgent span {
    color: var(--red);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      transform: scale(1.18);
    }
  }
</style>
