import { describe, it, expect } from 'vitest';
import {
  Shoe, handTotal, bankerDraws, playCoup, settle, cardValue, isNatural, isPair,
} from './baccarat.js';

const c = (rank, suit = 'S') => ({ rank, suit });
const drawFrom = (ranks) => {
  const cards = ranks.map((r) => c(r));
  return () => cards.shift();
};

describe('values', () => {
  it('scores tens and faces as zero', () => {
    expect(['10', 'J', 'Q', 'K'].map((r) => cardValue(c(r)))).toEqual([0, 0, 0, 0]);
    expect(cardValue(c('A'))).toBe(1);
    expect(handTotal([c('7'), c('8')])).toBe(5);
    expect(handTotal([c('9'), c('K')])).toBe(9);
  });
  it('detects naturals and pairs', () => {
    expect(isNatural([c('4'), c('4')])).toBe(true);
    expect(isNatural([c('4'), c('4'), c('K')])).toBe(false);
    expect(isPair([c('Q', 'H'), c('Q', 'S')])).toBe(true);
    expect(isPair([c('Q'), c('K')])).toBe(false);
  });
});

describe('shoe', () => {
  it('holds eight decks and burns on start', () => {
    const shoe = new Shoe(8);
    expect(shoe.cards.length).toBe(416);
    expect(shoe.burned.length).toBeGreaterThanOrEqual(2);
    expect(shoe.remaining).toBe(416 - shoe.burned.length);
    expect(shoe.cutIndex).toBeLessThan(416);
  });
});

describe('banker tableau', () => {
  it('stands pat without a player third card on 6 and 7', () => {
    expect(bankerDraws(5, null)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
  });
  it('follows the drawing chart', () => {
    expect(bankerDraws(3, c('8'))).toBe(false);
    expect(bankerDraws(3, c('9'))).toBe(true);
    expect(bankerDraws(4, c('A'))).toBe(false);
    expect(bankerDraws(4, c('2'))).toBe(true);
    expect(bankerDraws(5, c('4'))).toBe(true);
    expect(bankerDraws(5, c('8'))).toBe(false);
    expect(bankerDraws(6, c('6'))).toBe(true);
    expect(bankerDraws(6, c('8'))).toBe(false);
    expect(bankerDraws(7, c('7'))).toBe(false);
    expect(bankerDraws(2, c('K'))).toBe(true);
  });
});

describe('coup', () => {
  it('stops on a natural', () => {
    // Deal order P B P B: Player 9 (4+5), Banker 3 (A+2)
    const r = playCoup(drawFrom(['4', 'A', '5', '2', 'K', 'K']));
    expect(r.player.length).toBe(2);
    expect(r.banker.length).toBe(2);
    expect(r.winner).toBe('player');
  });
  it('draws a player third and applies banker rule', () => {
    // Player 2+3=5 draws a 4 → 9. Banker 3+K=3, player third 4 → banker draws.
    const r = playCoup(drawFrom(['2', '3', '3', 'K', '4', '5']));
    expect(r.player.map((x) => x.rank)).toEqual(['2', '3', '4']);
    expect(r.banker.map((x) => x.rank)).toEqual(['3', 'K', '5']);
    expect(r.bankerTotal).toBe(8);
    expect(r.winner).toBe('player');
    expect(r.steps.length).toBe(6);
  });
  it('player stands on 6, banker draws on 5', () => {
    const r = playCoup(drawFrom(['3', '2', '3', '3', '9']));
    expect(r.player.length).toBe(2);
    expect(r.banker.map((x) => x.rank)).toEqual(['2', '3', '9']);
    expect(r.winner).toBe('player');
  });
});

describe('settlement', () => {
  it('pays banker with commission and pushes main bets on tie', () => {
    const bankerWin = { player: [c('2'), c('K')], banker: [c('9'), c('K')], winner: 'banker' };
    const s = settle({ banker: 1000, player: 500 }, bankerWin);
    expect(s.lines.banker.profit).toBe(950);
    expect(s.lines.player.profit).toBe(-500);
    expect(s.net).toBe(450);

    const tie = { player: [c('3'), c('4')], banker: [c('7'), c('K')], winner: 'tie' };
    const t = settle({ banker: 1000, player: 1000, tie: 100 }, tie);
    expect(t.lines.player.returned).toBe(1000);
    expect(t.lines.banker.returned).toBe(1000);
    expect(t.lines.tie.profit).toBe(800);
  });
  it('pays pairs 11 to 1', () => {
    const r = { player: [c('8', 'H'), c('8', 'S')], banker: [c('2'), c('3')], winner: 'banker' };
    expect(settle({ playerPair: 100, bankerPair: 100 }, r).net).toBe(1100 - 100);
  });
});
