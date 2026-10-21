<script>
  // A two-sided card for flight animations: rotateY(0) shows the face, rotateY(180deg) the back.
  import PlayingCard from './PlayingCard.svelte';

  let { card = null, w = 80 } = $props();
</script>

<div class="flip">
  <div class="side front"><PlayingCard {card} {w} back={!card} /></div>
  <div class="side backside"><PlayingCard back {w} /></div>
</div>

<style>
  .flip {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }
  .side {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .backside {
    transform: rotateY(180deg);
  }
</style>
