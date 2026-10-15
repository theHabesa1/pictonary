<script>
  import { CARDS_PER_GAME, POWERUPS, POWERUP_IDS, STARS, xpForLevel } from '../../shared/powerups.js';
  import { account, buyCard, deleteMyAccount, loadLeaderboard, signIn, signOut, signUp } from '../lib/account.svelte.js';
  import { sfx } from '../lib/sound.js';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let bought = $state(null); // card id just bought (for a little animation)

  const close = () => {
    account.modal = null;
    error = '';
  };
  const show = (m) => {
    account.modal = m;
    error = '';
  };

  const u = $derived(account.user);
  const signingUp = $derived(account.modal === 'signup');
  const tab = $derived(u ? (['profile', 'shop', 'leaders'].includes(account.modal) ? account.modal : 'profile') : signingUp ? 'signup' : 'signin');

  // XP progress towards the next level.
  const lvFrom = $derived(u ? xpForLevel(u.level) : 0);
  const lvTo = $derived(u ? xpForLevel(u.level + 1) : 1);
  const lvPct = $derived(u ? Math.min(100, Math.round(((u.xp - lvFrom) / (lvTo - lvFrom)) * 100)) : 0);

  $effect(() => {
    if (tab === 'leaders') loadLeaderboard();
  });

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      if (signingUp) await signUp(username.trim(), password);
      else await signIn(username.trim(), password);
      password = '';
    } catch (err) {
      error = err.message;
    }
    busy = false;
  }

  async function buy(id) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await buyCard(id);
      bought = id;
      sfx('coins');
      setTimeout(() => bought === id && (bought = null), 900);
    } catch (err) {
      error = err.message;
    }
    busy = false;
  }

  const rarity = (cost) => (cost >= 55 ? 'epic' : cost >= 40 ? 'rare' : 'common');
  const placeLabel = (p) => ['🥇', '🥈', '🥉'][p - 1] ?? `#${p}`;
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${Math.max(1, m)}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
  };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && account.modal && close()} />

{#if account.modal}
  <div class="wrap">
    <button class="scrim" aria-label="Close" onclick={close}></button>
    <div class="modal card" role="dialog" aria-modal="true" aria-label="Your account">
      <button class="x" onclick={close} aria-label="Close">✕</button>

      {#if !u}
        <!-- ───── sign in / sign up ───── -->
        <h2>{signingUp ? '✨ Create your account' : '👋 Welcome back!'}</h2>
        <p class="sub">
          {signingUp
            ? 'Earn ⭐ stars every game, level up, and unlock power-up cards. No email needed.'
            : 'Sign in to keep your stars, level and power-up cards.'}
        </p>
        <div class="tabs">
          <button class:on={!signingUp} onclick={() => show('signin')}>Sign in</button>
          <button class:on={signingUp} onclick={() => show('signup')}>Create account</button>
        </div>
        <form onsubmit={submit}>
          <label class="label" for="acc-user">Username</label>
          <input
            id="acc-user"
            class="input"
            bind:value={username}
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            maxlength="20"
            placeholder="e.g. grandma_sue"
          />
          <label class="label" for="acc-pass">Password</label>
          <input
            id="acc-pass"
            class="input"
            type="password"
            bind:value={password}
            autocomplete={signingUp ? 'new-password' : 'current-password'}
            maxlength="100"
            placeholder={signingUp ? 'At least 6 characters' : ''}
          />
          {#if signingUp}
            <p class="note">💡 Pick something you'll remember — there's no email, so passwords can't be reset.</p>
          {/if}
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <button class="btn green big wide" type="submit" disabled={busy || !username || !password}>
            {busy ? '…' : signingUp ? '🚀 Create account' : '🔓 Sign in'}
          </button>
        </form>
      {:else}
        <!-- ───── signed in ───── -->
        <div class="head">
          <span class="big-av">{u.avatar}</span>
          <div class="who">
            <h2>{u.displayName}</h2>
            <span class="handle">@{u.username}</span>
          </div>
          <div class="balance" title="Your stars">⭐ {u.stars}</div>
        </div>
        <div class="tabs">
          <button class:on={tab === 'profile'} onclick={() => show('profile')}>📊 Profile</button>
          <button class:on={tab === 'shop'} onclick={() => show('shop')}>🛒 Card shop</button>
          <button class:on={tab === 'leaders'} onclick={() => show('leaders')}>🏆 Top players</button>
        </div>

        {#if tab === 'profile'}
          <div class="level">
            <span class="lv-badge">Lv {u.level}</span>
            <div class="xp">
              <div class="xp-bar"><span style:width="{lvPct}%"></span></div>
              <small>{u.xp.toLocaleString()} / {lvTo.toLocaleString()} XP to level {u.level + 1}</small>
            </div>
          </div>
          <div class="stats">
            <div><b>{u.gamesPlayed}</b><span>Games</span></div>
            <div><b>{u.gamesWon}</b><span>Wins</span></div>
            <div><b>{u.correctGuesses}</b><span>Correct guesses</span></div>
            <div><b>{u.drawingsGuessed}</b><span>Drawings guessed</span></div>
          </div>
          <p class="today">⭐ Stars earned today: <b>{u.starsToday}</b> / {STARS.dailyCap}</p>
          {#if account.history.length}
            <h3>Recent games</h3>
            <ul class="history">
              {#each account.history as g}
                <li>
                  <span>{g.mode === 'teams' ? '👨‍👩‍👧‍👦' : '🙋'} {placeLabel(g.place)} of {g.players}</span>
                  <span class="pts">{g.score} pts</span>
                  <span class="earned">+{g.stars} ⭐</span>
                  <small>{ago(g.playedAt)}</small>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="empty">No finished games yet — play one to start earning ⭐!</p>
          {/if}
          <div class="account-actions">
            <button class="btn white small" onclick={signOut}>🚪 Sign out</button>
            <button
              class="link-danger"
              onclick={async () => {
                if (!confirm(`Delete the account "${u.username}" forever? Your stars, cards and stats will be gone.`)) return;
                try {
                  await deleteMyAccount();
                } catch (err) {
                  error = err.message;
                }
              }}>Delete account</button
            >
          </div>
          {#if error}<p class="error" role="alert">{error}</p>{/if}
        {:else if tab === 'shop'}
          <details class="earn">
            <summary>⭐ How do I earn stars?</summary>
            <ul>
              <li>1 ⭐ for every {STARS.perPoints} points you score in a game</li>
              <li>+{STARS.winBonus} ⭐ for winning (or being on the winning team)</li>
              <li>+{STARS.podiumBonus} ⭐ for 2nd or 3rd place</li>
              <li>+{STARS.dailyBonus} ⭐ for your first game each day</li>
              <li>Up to {STARS.dailyCap} ⭐ per day · only for games played to the end</li>
            </ul>
          </details>
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <div class="cards">
            {#each POWERUP_IDS as id}
              {@const c = POWERUPS[id]}
              {@const owned = account.inventory[id] ?? 0}
              <div class="pcard {rarity(c.cost)}" class:bought={bought === id}>
                <div class="pc-top">
                  <span class="pc-emoji">{c.emoji}</span>
                  {#if owned}<span class="owned">×{owned}</span>{/if}
                </div>
                <b>{c.name}</b>
                <p>{c.desc}</p>
                <small class="when">
                  {c.when === 'guessing' ? '🙋 When guessing' : c.when === 'drawing' ? '✏️ When drawing' : '✏️ When picking a word'}
                </small>
                <button class="btn small" class:green={u.stars >= c.cost} disabled={busy || u.stars < c.cost} onclick={() => buy(id)}>
                  {u.stars >= c.cost ? `Buy · ${c.cost} ⭐` : `Need ${c.cost - u.stars} more ⭐`}
                </button>
              </div>
            {/each}
          </div>
          <p class="rules">You can play 1 card per turn and {CARDS_PER_GAME} per game. The host can switch cards off.</p>
        {:else}
          <ol class="leaders">
            {#each account.leaderboard as p, i}
              <li>
                <span class="rank">{placeLabel(i + 1)}</span>
                <span class="lav">{p.avatar}</span>
                <span class="lname">{p.name}</span>
                <span class="lv-badge small">Lv {p.level}</span>
                <span class="lwins">{p.wins} 🏆</span>
              </li>
            {:else}
              <li class="empty">No one on the board yet — be the first!</li>
            {/each}
          </ol>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 12px;
    overflow-y: auto;
  }
  .scrim {
    position: fixed;
    inset: 0;
    border: none;
    background: rgba(29, 20, 66, 0.55);
    cursor: default;
  }
  .modal {
    position: relative;
    width: min(520px, 100%);
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    padding: 22px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: pop-in 0.25s ease;
  }
  .x {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 10px;
    background: var(--line);
    font-weight: 900;
  }
  h2 {
    font-size: 1.45rem;
    padding-right: 36px;
  }
  h3 {
    font-size: 1rem;
    margin-top: 4px;
  }
  .sub {
    margin: -4px 0 0;
    color: var(--ink-soft);
    font-weight: 600;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--cream);
    border-radius: 12px;
  }
  .tabs button {
    flex: 1;
    border: none;
    background: none;
    padding: 8px 6px;
    border-radius: 9px;
    font-weight: 800;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .tabs button.on {
    background: #fff;
    box-shadow: 0 2px 0 var(--line);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  form .btn {
    margin-top: 8px;
  }
  .wide {
    width: 100%;
  }
  .note {
    margin: 2px 0 0;
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 700;
  }
  .error {
    margin: 0;
    padding: 8px 12px;
    background: #ffe4e6;
    border: 2px solid var(--red);
    border-radius: 12px;
    color: #9f1239;
    font-weight: 700;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 36px;
  }
  .big-av {
    font-size: 2.8rem;
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border: 3px solid var(--ink);
    border-radius: 50%;
    background: var(--cream);
    flex: none;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .who h2 {
    padding: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .handle {
    color: var(--muted);
    font-weight: 700;
  }
  .balance {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.35rem;
    background: #fff7d6;
    border: 2px solid #f5b400;
    border-radius: 999px;
    padding: 4px 12px;
    white-space: nowrap;
  }
  .level {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .lv-badge {
    background: var(--violet);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.3rem;
    padding: 6px 12px;
    border-radius: 12px;
    border: 2px solid var(--ink);
    white-space: nowrap;
  }
  .lv-badge.small {
    font-size: 0.8rem;
    padding: 1px 7px;
    border-width: 0;
    border-radius: 6px;
  }
  .xp {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .xp-bar {
    height: 14px;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--line);
    overflow: hidden;
  }
  .xp-bar span {
    display: block;
    height: 100%;
    background: var(--green);
    transition: width 0.6s ease;
  }
  .xp small {
    color: var(--muted);
    font-weight: 700;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    border: 2px solid var(--line);
    border-radius: 12px;
    text-align: center;
  }
  .stats b {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  .stats span {
    font-size: 0.72rem;
    font-weight: 800;
    color: var(--muted);
    line-height: 1.1;
  }
  .today {
    margin: 0;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .history li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .history .pts {
    color: var(--muted);
  }
  .history .earned {
    color: #b45309;
  }
  .history small {
    color: var(--muted);
    min-width: 52px;
    text-align: right;
  }
  .empty {
    color: var(--muted);
    font-weight: 700;
    text-align: center;
    margin: 6px 0;
  }
  .account-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .link-danger {
    border: none;
    background: none;
    color: #be123c;
    font-weight: 800;
    font-size: 0.85rem;
    text-decoration: underline;
    padding: 4px;
  }
  .earn {
    border: 2px dashed #f5b400;
    background: #fffbea;
    border-radius: 12px;
    padding: 8px 12px;
    font-weight: 700;
  }
  .earn summary {
    cursor: pointer;
  }
  .earn ul {
    margin: 6px 0 0;
    padding-left: 20px;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .pcard {
    --tone: #dcfce7;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border: 3px solid var(--ink);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 4px 0 var(--ink);
    position: relative;
  }
  .pcard.rare {
    --tone: #dbeafe;
  }
  .pcard.epic {
    --tone: #ede9fe;
  }
  .pc-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--tone);
    border-radius: 9px;
    padding: 6px 8px;
  }
  .pc-emoji {
    font-size: 2rem;
    line-height: 1;
  }
  .owned {
    font-family: var(--font-display);
    font-weight: 700;
    background: var(--ink);
    color: #fff;
    border-radius: 999px;
    padding: 0 8px;
  }
  .pcard b {
    font-family: var(--font-display);
    font-size: 1.02rem;
  }
  .pcard p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-soft);
    font-weight: 600;
    line-height: 1.3;
    flex: 1;
  }
  .when {
    font-size: 0.72rem;
    font-weight: 800;
    color: var(--muted);
  }
  .pcard .btn {
    margin-top: 4px;
    white-space: normal;
    line-height: 1.15;
  }
  .pcard.bought {
    animation: wiggle 0.3s ease 3;
  }
  .rules {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 700;
    text-align: center;
  }
  .leaders {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .leaders li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 2px solid var(--line);
    border-radius: 12px;
    font-weight: 800;
  }
  .rank {
    width: 28px;
    text-align: center;
  }
  .lav {
    font-size: 1.3rem;
  }
  .lname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lwins {
    color: var(--muted);
    font-size: 0.9rem;
  }
  @media (max-width: 480px) {
    .modal {
      padding: 18px 14px 16px;
    }
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
    .tabs button {
      font-size: 0.82rem;
    }
    .cards {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
