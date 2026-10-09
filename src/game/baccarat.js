// Pure Punto Banco rules: shoe, hand totals, third-card tableau and bet settlement.
// No rendering or timing concerns live here so the rules can be unit tested.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function cardValue(card) {
  const i = RANKS.indexOf(card.rank);
  return i >= 9 ? 0 : i + 1;
}

export function handTotal(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
}

export function isNatural(cards) {
  return cards.length === 2 && handTotal(cards) >= 8;
}

export function isPair(cards) {
  return cards.length >= 2 && cards[0].rank === cards[1].rank;
}

// Fisher–Yates with an injectable RNG for deterministic tests.
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Shoe {
  constructor(decks = 8, rng = Math.random) {
    this.decks = decks;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const cards = [];
    for (let d = 0; d < this.decks; d++) {
      for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
    }
    this.cards = shuffle(cards, this.rng);
    // Cut card sits roughly a deck from the end; the hand in progress finishes, then the shoe is replaced.
    this.cutIndex = this.cards.length - 14 - Math.floor(this.rng() * 26);
    this.position = 0;
    this.burned = [];
    this.cutReached = false;
    this.burn();
  }

  // Standard burn: flip the first card, then discard that many cards (face cards/tens burn ten).
  burn() {
    const first = this.draw();
    const n = cardValue(first) || 10;
    this.burned = [first];
    for (let i = 0; i < n; i++) this.burned.push(this.draw());
  }

  draw() {
    if (this.position >= this.cards.length) throw new Error('Shoe exhausted');
    const card = this.cards[this.position++];
    if (this.position >= this.cutIndex) this.cutReached = true;
    return card;
  }

  get remaining() {
    return this.cards.length - this.position;
  }
}

// Banker draws on its third card based on its total and the Player's third card.
export function bankerDraws(bankerTotal, playerThird) {
  if (playerThird == null) return bankerTotal <= 5;
  const v = cardValue(playerThird);
  switch (bankerTotal) {
    case 0: case 1: case 2: return true;
    case 3: return v !== 8;
    case 4: return v >= 2 && v <= 7;
    case 5: return v >= 4 && v <= 7;
    case 6: return v === 6 || v === 7;
    default: return false;
  }
}

// Plays a full coup. `draw` supplies cards so the caller can drive the shoe.
// Returns the hands plus the order cards were dealt, for animation.
export function playCoup(draw) {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  const steps = [
    { side: 'player', index: 0 }, { side: 'banker', index: 0 },
    { side: 'player', index: 1 }, { side: 'banker', index: 1 },
  ];
  let natural = isNatural(player) || isNatural(banker);
  if (!natural) {
    let playerThird = null;
    if (handTotal(player) <= 5) {
      playerThird = draw();
      player.push(playerThird);
      steps.push({ side: 'player', index: 2 });
    }
    if (bankerDraws(handTotal(banker), playerThird)) {
      banker.push(draw());
      steps.push({ side: 'banker', index: 2 });
    }
  }
  return { player, banker, steps, ...outcome(player, banker) };
}

export function outcome(player, banker) {
  const p = handTotal(player);
  const b = handTotal(banker);
  return { playerTotal: p, bankerTotal: b, winner: p > b ? 'player' : b > p ? 'banker' : 'tie' };
}

export const BET_KEYS = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];

export const PAYOUTS = {
  player: '1 : 1',
  banker: '0.95 : 1',
  tie: '8 : 1',
  playerPair: '11 : 1',
  bankerPair: '11 : 1',
};

// Returns, per bet key, the net multiplier: >0 win (profit = stake × m), 0 push, -1 lose.
export function settlementMultipliers(result) {
  const { winner } = result;
  return {
    player: winner === 'player' ? 1 : winner === 'tie' ? 0 : -1,
    banker: winner === 'banker' ? 0.95 : winner === 'tie' ? 0 : -1,
    tie: winner === 'tie' ? 8 : -1,
    playerPair: isPair(result.player) ? 11 : -1,
    bankerPair: isPair(result.banker) ? 11 : -1,
  };
}

// Settles a bets map {key: stake}. Returns per-bet {stake, multiplier, profit, returned}
// where `returned` is what goes back to the player (stake + profit, or 0 on a loss).
export function settle(bets, result) {
  const m = settlementMultipliers(result);
  const lines = {};
  let net = 0;
  let returned = 0;
  for (const key of BET_KEYS) {
    const stake = bets[key] || 0;
    if (!stake) continue;
    const mult = m[key];
    const profit = mult >= 0 ? Math.floor(stake * mult) : -stake;
    const back = mult >= 0 ? stake + profit : 0;
    lines[key] = { stake, multiplier: mult, profit, returned: back };
    net += profit;
    returned += back;
  }
  return { lines, net, returned };
}

export function cardName(card) {
  const ranks = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
  const suits = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  return `${ranks[card.rank] || card.rank} of ${suits[card.suit]}`;
}
