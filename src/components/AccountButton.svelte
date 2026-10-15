<script>
  import { account, openAccount } from '../lib/account.svelte.js';
</script>

{#if account.user}
  <button class="chip" onclick={() => openAccount('profile')} title="Your account, stats and power-up shop">
    <span class="av">{account.user.avatar}</span>
    <span class="nm">{account.user.displayName}</span>
    <span class="lv">Lv {account.user.level}</span>
    <span class="stars">⭐ {account.user.stars}</span>
  </button>
{:else if !account.checking}
  <button class="btn white small" onclick={() => openAccount('signin')}>👤 Sign in</button>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 5px;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: #fff;
    font-weight: 800;
    box-shadow: var(--shadow-sm);
    max-width: 100%;
  }
  .chip:hover {
    background: #fffbea;
  }
  .av {
    font-size: 1.3rem;
    line-height: 1;
  }
  .nm {
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lv {
    background: var(--violet);
    color: #fff;
    border-radius: 6px;
    padding: 0 5px;
    font-size: 0.75rem;
  }
  .stars {
    color: #b45309;
  }
  @media (max-width: 420px) {
    .nm {
      display: none;
    }
  }
</style>
