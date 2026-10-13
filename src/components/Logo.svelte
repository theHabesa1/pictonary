<script>
  let { small = false } = $props();
  const letters = [...'Pictonary'];
  const colors = ['#ffd23f', '#ff5fa2', '#3bc9ff', '#22c55e', '#ff8a3d', '#ffd23f', '#ff5fa2', '#3bc9ff', '#22c55e'];
</script>

<h1 class="logo" class:small aria-label="Pictonary">
  <span class="pencil" aria-hidden="true">✏️</span>
  {#each letters as l, i}
    <span
      class="l"
      aria-hidden="true"
      style:color={colors[i]}
      style:--r="{i % 2 ? 4 : -4}deg"
      style:animation-delay="{i * 0.08}s">{l}</span
    >
  {/each}
</h1>

<style>
  .logo {
    display: flex;
    align-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(2.6rem, 11vw, 4.2rem);
    letter-spacing: 0.01em;
    user-select: none;
  }
  .logo.small {
    font-size: 1.6rem;
  }
  .l {
    display: inline-block;
    transform: rotate(var(--r));
    -webkit-text-stroke: 0.09em var(--ink);
    paint-order: stroke fill;
    text-shadow: 0 0.07em 0 var(--ink);
    animation: hop 2.4s ease-in-out infinite;
  }
  .small .l {
    animation: none;
  }
  .pencil {
    font-size: 0.75em;
    margin-right: 0.12em;
    animation: wiggle 1.2s ease-in-out infinite;
  }
  .small .pencil {
    animation: none;
  }
  @keyframes hop {
    0%,
    80%,
    100% {
      transform: rotate(var(--r)) translateY(0);
    }
    88% {
      transform: rotate(var(--r)) translateY(-0.12em);
    }
  }
</style>
