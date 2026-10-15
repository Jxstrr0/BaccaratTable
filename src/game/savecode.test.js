import { describe, it, expect } from 'vitest';
import {
  makeCode, readCode, cleanSave, PREFIX, MESSAGES, SaveCodeError, toBase64Url, checksum,
} from './savecode.js';

// A save with some real progress in it, shaped like the one in localStorage.
const played = {
  balance: 187650,
  settings: { sound: false, music: 0.2, sfx: 0.65, fast: true },
  lastBets: { player: 5000, banker: 0, tie: 500, playerPair: 0, bankerPair: 0 },
  tutorialDone: true,
  stats: { hands: 42, biggestWin: 25000 },
};

// What a brand-new player has before anything is saved (the game's starting values).
const fresh = {
  balance: 100000,
  settings: { sound: true, music: 0.35, sfx: 0.8, fast: false },
  lastBets: null,
  tutorialDone: false,
  stats: { hands: 0, biggestWin: 0 },
};

// Runs fn and returns the friendly message it was turned away with ('accepted' if it wasn't).
const reason = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof SaveCodeError ? e.message : `not friendly: ${e}`;
  }
  return 'accepted';
};

describe('save codes', () => {
  it('round trips a save with progress', () => {
    const code = makeCode(played);
    expect(code.startsWith(PREFIX)).toBe(true);
    expect(code).toMatch(/^BT1:[A-Za-z0-9_-]+$/); // safe for chat apps: no spaces, +, / or =
    expect(code.length).toBeLessThan(300);
    expect(readCode(code)).toEqual({
      ...played,
      lastBets: { player: 5000, tie: 500 }, // empty spots are dropped
    });
  });

  it('round trips an empty save (a brand-new player)', () => {
    expect(readCode(makeCode(fresh))).toEqual(fresh);
  });

  it('copes with spaces, line breaks and words around the code', () => {
    const code = makeCode(played);
    const messy = `Here is my save: ${code.slice(0, 20)}\n ${code.slice(20, 50)}​${code.slice(50)}.`;
    expect(readCode(messy)).toEqual(readCode(code));
  });

  it('asks for a code when the box is empty', () => {
    expect(reason(() => readCode(''))).toBe(MESSAGES.empty);
    expect(reason(() => readCode('   \n  '))).toBe(MESSAGES.empty);
    expect(reason(() => readCode(undefined))).toBe(MESSAGES.empty);
  });

  it('rejects a damaged or cut-short code', () => {
    const code = makeCode(played);
    const flipped = code.slice(0, 30) + (code[30] === 'A' ? 'B' : 'A') + code.slice(31);
    expect(reason(() => readCode(flipped))).toBe(MESSAGES.damaged);
    expect(reason(() => readCode(code.slice(0, -1)))).toBe(MESSAGES.damaged);
    expect(reason(() => readCode(code.slice(0, 40)))).toBe(MESSAGES.damaged);
    expect(reason(() => readCode(PREFIX))).toBe(MESSAGES.damaged);
    expect(reason(() => readCode('hello there'))).toBe(MESSAGES.notCode);
  });

  it('rejects a code from a different game', () => {
    expect(reason(() => readCode('GG1:eyJiYW5kSWQiOiJ4In0abc123'))).toBe(MESSAGES.otherGame);
    expect(reason(() => readCode('RS1:abcdef123456'))).toBe(MESSAGES.otherGame);
  });

  it('rejects a code from a newer version with a friendly message', () => {
    const newer = makeCode(played).replace(/^BT1:/, 'BT2:');
    expect(reason(() => readCode(newer))).toBe(MESSAGES.newer);
  });

  it('rejects a code with a good checksum but a bad save inside', () => {
    // A code with any JSON inside and a correct checksum, so only the save check can stop it.
    const withBody = (json) => {
      const body = toBase64Url(json);
      return PREFIX + body + checksum(body);
    };
    // Sanity check: the helper makes codes readCode accepts.
    expect(readCode(withBody(JSON.stringify(fresh)))).toEqual(fresh);

    for (const bad of [
      '{}', // an empty save: no bankroll at all
      'null',
      '[1,2,3]',
      'not json',
      '{"balance":"lots"}',
      '{"balance":-5}',
      '{"balance":1e300}',
      '{"balance":5000,"settings":{"sound":"yes"}}',
      '{"balance":5000,"settings":{"music":7}}',
      '{"balance":5000,"lastBets":{"player":-100}}',
      '{"balance":5000,"stats":{"hands":1.5}}',
      '{"balance":5000,"tutorialDone":"true"}',
    ]) {
      expect(reason(() => readCode(withBody(bad))), bad).toBe(MESSAGES.damaged);
    }
  });

  it('fills in missing optional fields and skips retired bets', () => {
    expect(cleanSave({ balance: 2500, lastBets: { dragon: 100, banker: 200 } })).toEqual({
      balance: 2500,
      settings: {},
      lastBets: { banker: 200 },
      tutorialDone: false,
      stats: { hands: 0, biggestWin: 0 },
    });
  });

  it('will not make a code from a broken save', () => {
    expect(() => makeCode({ balance: NaN })).toThrow(SaveCodeError);
  });
});
