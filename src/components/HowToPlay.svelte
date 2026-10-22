<script>
  // "How to play" guides for every game, shown as a modal.
  import { closeGuide, guide } from '../lib/guide.svelte.js';
  import PlayingCard from './cards/PlayingCard.svelte';

  const id = $derived(guide.open);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && guide.open && closeGuide()} />

{#if id}
  <div class="wrap">
    <button class="scrim" aria-label="Close" onclick={closeGuide}></button>
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <button class="x" onclick={closeGuide} aria-label="Close">✕</button>

      {#if id === 'imposter'}
        <h2 id="guide-title">🕵️ How to play Imposter</h2>
        <div class="goal">
          <b>The idea:</b> everyone gets the same <b>secret word</b>, except one player, the <b>imposter</b>, who only
          sees the category. The crew tries to spot the imposter. The imposter tries to blend in.
        </div>

        <ol class="steps">
          <li>
            <span class="num">1</span>
            <div>
              <h3>🃏 Check your secret role</h3>
              <p>Tap the card on your screen to see your role. Keep your screen hidden from the people next to you!</p>
              <div class="roles">
                <div class="role crew"><small>Crew sees</small><b>PIZZA</b><span>🍔 Food</span></div>
                <div class="role imp"><small>Imposter sees</small><b>🕵️ IMPOSTER</b><span>🍔 Food only</span></div>
              </div>
            </div>
          </li>
          <li>
            <span class="num">2</span>
            <div>
              <h3>💬 Give one clue on your turn</h3>
              <p>
                When it's your turn, type <b>one word</b> that fits the secret word. Make it clear enough to prove you know
                the word, but not so obvious that the imposter can guess it. You can't use the word itself.
              </p>
              <div class="example">
                <span class="ex-label">Word: PIZZA</span>
                <span class="good">✅ cheese</span><span class="good">✅ slice</span><span class="good">✅ Italy</span>
                <span class="bad">❌ pizza</span><span class="meh">🤔 food (too vague)</span>
              </div>
            </div>
          </li>
          <li>
            <span class="num">3</span>
            <div>
              <h3>🗳️ Vote for the imposter</h3>
              <p>
                After everyone has given their clues, talk it over in the chat and <b>tap the player you think is faking it</b>.
                Each card shows that player's clues. You can change your vote until the timer ends. The player with the
                most votes is accused; if it's a tie, the imposter escapes.
              </p>
            </div>
          </li>
          <li>
            <span class="num">4</span>
            <div>
              <h3>🎯 The imposter's last chance</h3>
              <p>If the imposter gets caught, they get <b>one guess at the secret word</b>. Guess it right, and they steal the win!</p>
            </div>
          </li>
          <li>
            <span class="num">5</span>
            <div>
              <h3>🎭 The reveal</h3>
              <p>Everyone sees who the imposter was, the word, and who voted for whom. Then a new round starts with a new word, and someone else becomes the imposter.</p>
            </div>
          </li>
        </ol>

        <h3 class="sub">An example round</h3>
        <div class="round-ex">
          <div class="clue-row"><span>🦊 Ann</span><b>cheese</b></div>
          <div class="clue-row"><span>🐼 Ben</span><b>slice</b></div>
          <div class="clue-row sus"><span>🐸 Cat 🕵️</span><b>round</b><em>hmm… vague!</em></div>
          <div class="clue-row"><span>🐯 Dan</span><b>Italy</b></div>
          <p>Most people vote for <b>Cat</b>, who <b>was</b> the imposter! Cat's last-chance guess is "cake" ❌, so <b>the crew wins</b>.</p>
        </div>

        <h3 class="sub">Points</h3>
        <table class="points">
          <tbody>
            <tr><td>The crew catches the imposter</td><td><b>+100</b> each crew member</td></tr>
            <tr><td>You voted for the imposter</td><td><b>+50</b> bonus</td></tr>
            <tr><td>The wrong person is voted out, or a tie</td><td><b>+300</b> imposter</td></tr>
            <tr><td>Imposter caught, but guesses the word</td><td><b>+200</b> imposter</td></tr>
          </tbody>
        </table>

        <h3 class="sub">Tips</h3>
        <ul class="tips">
          <li><b>Crew:</b> watch for clues that are vague, late, or just copy someone else's.</li>
          <li><b>Imposter:</b> you never go first, so listen to the earlier clues and pick something that fits them and the category.</li>
          <li>Needs 3+ players. With 6+ players the host can turn on <b>2 imposters</b>.</li>
        </ul>
      {:else if id === 'cards'}
        <h2 id="guide-title">🃏 How to play Color Clash</h2>
        <div class="goal"><b>The idea:</b> be the first player to get rid of all your cards.</div>
        <ol class="steps">
          <li>
            <span class="num">1</span>
            <div>
              <h3>Match the top card</h3>
              <p>On your turn, play a card that matches the top of the pile by <b>color</b> or by <b>number/symbol</b>. Cards you can play lift up and glow.</p>
              <div class="mini-cards">
                <PlayingCard card={{ id: 'g1', color: 'blue', value: '7' }} w={46} />
                <span class="arrow">→</span>
                <PlayingCard card={{ id: 'g2', color: 'blue', value: '2' }} w={46} />
                <span class="or">or</span>
                <PlayingCard card={{ id: 'g3', color: 'red', value: '7' }} w={46} />
              </div>
            </div>
          </li>
          <li>
            <span class="num">2</span>
            <div>
              <h3>Action cards</h3>
              <ul class="tips">
                <li><b>⊘ Skip:</b> the next player misses their turn.</li>
                <li><b>⇄ Reverse:</b> play goes the other way.</li>
                <li><b>+2:</b> the next player draws 2 and misses their turn.</li>
                <li><b>Wild:</b> play it on anything and pick the new color.</li>
                <li><b>Wild +4:</b> pick a color, and the next player draws 4 and misses their turn.</li>
              </ul>
            </div>
          </li>
          <li>
            <span class="num">3</span>
            <div>
              <h3>Can't play? Draw</h3>
              <p>Tap the deck to draw one card. If it fits, you can play it right away, or keep it and pass.</p>
            </div>
          </li>
          <li>
            <span class="num">4</span>
            <div>
              <h3>📣 Shout LAST CARD!</h3>
              <p>When you're down to one card, press <b>LAST CARD!</b> If someone presses <b>🚨 Catch!</b> on you first, you draw 2.</p>
            </div>
          </li>
          <li>
            <span class="num">5</span>
            <div>
              <h3>🏆 Win the round</h3>
              <p>Empty your hand first to win the round and score the cards left in everyone else's hands (numbers = face value, action cards 20, wilds 50).</p>
            </div>
          </li>
        </ol>
      {:else}
        <h2 id="guide-title">🎨 How to play Pictonary</h2>
        <div class="goal"><b>The idea:</b> take turns drawing a word while everyone else races to guess it.</div>
        <ol class="steps">
          <li><span class="num">1</span><div><h3>✏️ Pick a word</h3><p>When it's your turn, choose one of the words. Harder words are worth more points.</p></div></li>
          <li><span class="num">2</span><div><h3>🖌️ Draw it</h3><p>Use colors, brush sizes, the fill bucket and undo. No writing letters or numbers!</p></div></li>
          <li><span class="num">3</span><div><h3>💬 Guess in the chat</h3><p>Type your guesses. Faster guesses score more, and the drawer scores when people get it. As time runs down, letters of the word appear as hints.</p></div></li>
          <li><span class="num">4</span><div><h3>👨‍👩‍👧‍👦 Teams mode</h3><p>Your team guesses your drawing. If the host allows steals, other teams can guess first and take the points!</p></div></li>
          <li><span class="num">5</span><div><h3>🎴 Power-up cards</h3><p>Signed-in players earn ⭐ stars and can buy secret power-ups like an extra letter or double points. Nobody else sees when you use one.</p></div></li>
        </ol>
      {/if}

      <button class="btn green big wide" onclick={closeGuide}>👍 Got it!</button>
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
    width: min(600px, 100%);
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    padding: 22px 20px 18px;
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
    font-size: 1.5rem;
    padding-right: 40px;
  }
  .goal {
    background: #fffbea;
    border: 2px dashed #f5b400;
    border-radius: 14px;
    padding: 10px 14px;
    font-weight: 600;
    line-height: 1.45;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .steps > li {
    display: grid;
    grid-template-columns: 34px 1fr;
    gap: 10px;
    align-items: start;
  }
  .num {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--ink);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  h3 {
    font-size: 1.08rem;
    margin-bottom: 2px;
  }
  .sub {
    margin-top: 6px;
    font-size: 1.15rem;
  }
  p {
    margin: 0;
    font-weight: 600;
    color: var(--ink-soft);
    line-height: 1.45;
  }
  .roles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }
  .role {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 3px solid;
    border-radius: 14px;
    padding: 8px;
    text-align: center;
  }
  .role.crew {
    background: #ecfdf3;
    border-color: #15803d;
  }
  .role.imp {
    background: #fff1f2;
    border-color: #be123c;
  }
  .role small {
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
  }
  .role b {
    font-family: var(--font-display);
    font-size: 1.3rem;
  }
  .role.imp b {
    color: #be123c;
    font-size: 1.05rem;
  }
  .role span {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .example {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .example span {
    border-radius: 999px;
    padding: 2px 10px;
    font-weight: 800;
    font-size: 0.85rem;
    border: 2px solid var(--line);
    background: #fff;
  }
  .example .ex-label {
    background: var(--ink);
    color: #fff;
    border-color: var(--ink);
  }
  .example .good {
    border-color: #86efac;
  }
  .example .bad {
    border-color: #fca5a5;
  }
  .example .meh {
    border-color: #fde68a;
  }
  .round-ex {
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .clue-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
  }
  .clue-row span {
    width: 100px;
  }
  .clue-row b {
    background: var(--ink);
    color: #fff;
    border-radius: 8px;
    padding: 1px 9px;
  }
  .clue-row.sus b {
    background: #be123c;
  }
  .clue-row em {
    color: #be123c;
    font-size: 0.85rem;
  }
  .round-ex p {
    margin-top: 4px;
  }
  .points {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 4px;
    font-weight: 700;
    font-size: 0.92rem;
  }
  .points td {
    padding: 6px 10px;
    background: #faf8ff;
  }
  .points td:first-child {
    border-radius: 10px 0 0 10px;
  }
  .points td:last-child {
    border-radius: 0 10px 10px 0;
    text-align: right;
    white-space: nowrap;
  }
  .points b {
    color: #15803d;
  }
  .tips {
    margin: 0;
    padding-left: 18px;
    font-weight: 600;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .mini-cards {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-weight: 800;
    color: var(--muted);
  }
  .wide {
    width: 100%;
    margin-top: 4px;
  }
  @media (max-width: 480px) {
    .modal {
      padding: 18px 14px 14px;
    }
    .clue-row span {
      width: 84px;
    }
  }
</style>
