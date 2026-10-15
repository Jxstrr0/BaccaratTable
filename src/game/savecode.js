// Save codes: your whole save (bankroll, stats and settings) as one line of text.
// Copy it on one phone or browser, paste it on another, and you pick up where you left off.
// Nothing is sent anywhere: the code is made and read right here in the browser.
//
// What a code looks like:  BT1:eyJiYWxhbmNlIjoxMjM0NTAs...Xk3pQa
//   'BT1:'  BT = this game (Baccarat Table), 1 = the code format version.
//           If the format ever changes, make the new one 'BT2:' so old games can say "too new".
//   body    the save as JSON, in base64url (only A-Z a-z 0-9 - _), so chat apps and notes
//           apps don't mangle it. Saves are tiny, so no compression is needed.
//   last 6  a checksum of the body. If even one character is lost or changed, it won't match
//           and the code is turned away before anything is touched.
//
// No DOM or game objects in here, so it can be unit tested (see savecode.test.js).

import { BET_KEYS } from './baccarat.js';

const GAME = 'BT';
const VERSION = 1;
export const PREFIX = `${GAME}${VERSION}:`;
const CHECK_LENGTH = 6;
const MAX_MONEY = 1e12; // a trillion dollars: anything bigger is not a real save
const MAX_HANDS = 1e9;

// Friendly messages shown under the paste box. Keep them plain and calm.
export const MESSAGES = {
  empty: 'Paste your save code in the box first.',
  notCode: `That doesn't look like a save code. Codes for this game start with ${PREFIX}`,
  otherGame: `That looks like a save code from a different game. Codes for this game start with ${PREFIX}`,
  newer: 'That code comes from a newer version of this game. Reload the page to update, then try again.',
  damaged: 'That save code is damaged or incomplete. Copy the whole code and try again.',
};

// Thrown for any code we won't accept. Its message is always one of MESSAGES, safe to show.
export class SaveCodeError extends Error {}

const fail = (key) => {
  throw new SaveCodeError(MESSAGES[key]);
};

// ---- Making a code --------------------------------------------------------

// save: { balance, settings, lastBets, tutorialDone, stats }, the same shape the game keeps
// in localStorage. Returns the code string. Throws if the save itself isn't valid.
export function makeCode(save) {
  const body = toBase64Url(JSON.stringify(cleanSave(save)));
  return PREFIX + body + checksum(body);
}

// ---- Reading a code -------------------------------------------------------

// Turns pasted text back into a clean, checked save object. Throws SaveCodeError if the code
// is missing, damaged, from another game or from a newer version. Writes nothing itself.
export function readCode(text) {
  // Chat and notes apps can add spaces, line breaks or invisible characters. Drop them all.
  const s = String(text ?? '').replace(/[\s​-‍⁠﻿]+/g, '');
  if (!s) fail('empty');

  // Find "BT<version>:" anywhere, so extra words pasted around the code don't matter.
  const found = s.match(new RegExp(`${GAME}(\\d+):([A-Za-z0-9_-]*)`));
  if (!found) fail(/[A-Za-z]{2,}\d+:/.test(s) ? 'otherGame' : 'notCode');
  const version = Number(found[1]);
  if (version > VERSION) fail('newer');
  if (found[1] !== String(VERSION)) fail('damaged');

  const rest = found[2];
  if (rest.length <= CHECK_LENGTH) fail('damaged');
  const body = rest.slice(0, -CHECK_LENGTH);
  if (checksum(body) !== rest.slice(-CHECK_LENGTH)) fail('damaged');

  let data;
  try {
    data = JSON.parse(fromBase64Url(body));
  } catch {
    fail('damaged');
  }
  return cleanSave(data);
}

// ---- Checking a save ------------------------------------------------------

// Checks every field's type and range and returns a fresh, tidy copy. Anything wrong
// (a missing or silly bankroll, a setting of the wrong type...) throws, so a bad code can
// never be half applied. Optional fields that are missing get their starting values.
export function cleanSave(raw) {
  if (!isObject(raw)) fail('damaged');

  // Bankroll: required, whole dollars, zero up to a trillion.
  if (!isMoney(raw.balance)) fail('damaged');
  const out = { balance: Math.round(raw.balance) };

  // Settings: only the four known ones, each with the right type.
  out.settings = {};
  if (raw.settings !== undefined) {
    if (!isObject(raw.settings)) fail('damaged');
    for (const key of ['sound', 'fast']) {
      const v = raw.settings[key];
      if (v === undefined) continue;
      if (typeof v !== 'boolean') fail('damaged');
      out.settings[key] = v;
    }
    for (const key of ['music', 'sfx']) {
      const v = raw.settings[key];
      if (v === undefined) continue;
      if (!Number.isFinite(v) || v < 0 || v > 1) fail('damaged');
      out.settings[key] = Math.round(v * 100) / 100; // volume sliders move in steps of 0.01
    }
  }

  // Last hand's bets (for Rebet): null, or { player: 1000, tie: 100, ... }.
  // Empty spots are dropped and names of bets the table no longer has are skipped.
  out.lastBets = null;
  if (raw.lastBets != null) {
    if (!isObject(raw.lastBets)) fail('damaged');
    const bets = {};
    for (const [key, v] of Object.entries(raw.lastBets)) {
      if (!BET_KEYS.includes(key)) continue;
      if (!isMoney(v)) fail('damaged');
      if (v > 0) bets[key] = Math.round(v);
    }
    if (Object.keys(bets).length) out.lastBets = bets;
  }

  // Whether the "how to bet" hint has been seen.
  if (raw.tutorialDone !== undefined && typeof raw.tutorialDone !== 'boolean') fail('damaged');
  out.tutorialDone = raw.tutorialDone === true;

  // Lifetime stats.
  out.stats = { hands: 0, biggestWin: 0 };
  if (raw.stats !== undefined) {
    if (!isObject(raw.stats)) fail('damaged');
    const { hands = 0, biggestWin = 0 } = raw.stats;
    if (!Number.isInteger(hands) || hands < 0 || hands > MAX_HANDS) fail('damaged');
    if (!isMoney(biggestWin)) fail('damaged');
    out.stats = { hands, biggestWin: Math.round(biggestWin) };
  }
  return out;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isMoney(v) {
  return Number.isFinite(v) && v >= 0 && v <= MAX_MONEY;
}

// ---- Text helpers ---------------------------------------------------------

// UTF-8 text -> base64url (the URL-safe base64 alphabet, no '=' padding).
// Exported (with checksum) only so the tests can build broken codes on purpose.
export function toBase64Url(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// base64url -> UTF-8 text. Throws on anything that isn't valid.
function fromBase64Url(body) {
  const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// A 32-bit FNV-1a hash of the body, written as 6 base64url characters.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function checksum(body) {
  let h = 2166136261;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < CHECK_LENGTH; i++) {
    out += ALPHABET[h & 63];
    h = Math.floor(h / 64);
  }
  return out;
}
