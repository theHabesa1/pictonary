<script>
  // "What's new" release notes, shown as a modal (see lib/news.svelte.js).
  import { RELEASES, closeNews, news } from '../lib/news.svelte.js';

  const [latest, ...earlier] = RELEASES;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && news.open && closeNews()} />

{#if news.open}
  <div class="wrap">
    <button class="scrim" aria-label="Close" onclick={closeNews}></button>
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="news-title">
      <button class="x" onclick={closeNews} aria-label="Close">✕</button>
      <h2 id="news-title">✨ What's new</h2>
      <p class="date">{latest.date}</p>

      <ul class="items">
        {#each latest.items as item, i}
          <li style:animation-delay="{i * 0.05}s">
            <span class="emoji">{item.emoji}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          </li>
        {/each}
      </ul>

      {#if earlier.length}
        <details>
          <summary>Earlier updates</summary>
          {#each earlier as release}
            <p class="date">{release.date}</p>
            <ul class="items small">
              {#each release.items as item}
                <li>
                  <span class="emoji">{item.emoji}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </li>
              {/each}
            </ul>
          {/each}
        </details>
      {/if}

      <button class="btn green big wide" onclick={closeNews}>🎉 Let's play!</button>
    </div>
  </div>
{/if}

<style>
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 12px;
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
    padding: 22px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    font-size: 1.5rem;
    padding-right: 40px;
  }
  .date {
    margin: -6px 0 0;
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .items li {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--green-soft);
    animation: pop-in 0.3s ease backwards;
  }
  .emoji {
    font-size: 1.7rem;
    line-height: 1.2;
    text-align: center;
  }
  h3 {
    font-size: 1.05rem;
    margin-bottom: 2px;
  }
  p {
    margin: 0;
    font-weight: 600;
    line-height: 1.4;
    color: var(--muted);
  }
  details {
    border-top: 2px solid var(--line);
    padding-top: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 800;
    color: var(--muted);
    margin-bottom: 8px;
  }
  details .date {
    margin: 6px 0 6px;
  }
  .items.small li {
    background: #faf8ff;
    padding: 8px 10px;
  }
  .items.small .emoji {
    font-size: 1.3rem;
  }
  .items.small h3 {
    font-size: 0.95rem;
  }
  .wide {
    width: 100%;
    margin-top: 4px;
  }
  @media (max-width: 480px) {
    .modal {
      padding: 18px 14px 14px;
    }
  }
</style>
