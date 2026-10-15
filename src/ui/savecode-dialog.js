import { readCode, SaveCodeError, MESSAGES, PREFIX } from '../game/savecode.js';

const $ = (id) => document.getElementById(id);
const dollars = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// The Back up / Restore window, opened from the two buttons in Settings.
//   Back up: shows the save as a code in a read-only box, with a Copy button.
//   Restore: takes a pasted code, checks it, asks before replacing anything, then applies it.
// The HTML is the #save-code block in index.html; the code itself is made and read in
// src/game/savecode.js.
export class SaveCodeDialog {
  // handlers: backupCode() -> code, restoreSave(save) -> error message or null, bankroll() -> number.
  constructor(handlers, toast) {
    this.h = handlers;
    this.toast = toast;
    this.root = $('save-code');
    this.box = $('code-text');
    this.msg = $('code-msg');
    this.cancelBtn = $('code-cancel');
    this.goBtn = $('code-go');
    this.pending = null; // a checked save waiting for "Yes, restore"

    $('btn-backup').addEventListener('click', () => this.open('backup'));
    $('btn-restore').addEventListener('click', () => this.open('restore'));
    this.cancelBtn.addEventListener('click', () => this.back());
    this.goBtn.addEventListener('click', () => this.go());
    // Tapping the read-only code selects all of it, ready to copy by hand.
    this.box.addEventListener('focus', () => {
      if (this.box.readOnly) this.box.select();
    });
    // A fresh paste clears the last message ("damaged", "empty"...).
    this.box.addEventListener('input', () => this.say(''));
    document.addEventListener('keydown', (e) => {
      if (this.isOpen) this.onKey(e);
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(mode) {
    const backup = mode === 'backup';
    this.mode = mode;
    this.opener = document.activeElement;
    this.pending = null;
    $('code-title').textContent = backup ? 'Back up' : 'Restore';
    $('code-intro').textContent = backup
      ? 'This code holds your bankroll, stats and settings. Keep it somewhere safe, like your notes app, then use Restore on any phone or browser to pick up where you left off.'
      : `Paste a save code (it starts with ${PREFIX}). It replaces the bankroll, stats and settings on this device.`;
    this.box.placeholder = backup ? '' : `Paste your ${PREFIX} code here`;
    this.box.readOnly = backup;
    this.box.value = '';
    this.say('');
    if (backup) {
      try {
        this.box.value = this.h.backupCode();
      } catch {
        this.say("Couldn't make a code right now. Please try again in a moment.", 'bad');
      }
    }
    this.buttons(backup ? 'Done' : 'Cancel', backup ? 'Copy code' : 'Restore');
    this.root.classList.remove('hidden');
    (backup ? this.goBtn : this.box).focus();
  }

  close() {
    this.root.classList.add('hidden');
    this.box.value = '';
    this.pending = null;
    this.opener?.focus?.();
  }

  // Cancel / Done / Go back.
  back() {
    if (this.pending) {
      // Step back from "are you sure?" to the paste box, keeping what was pasted.
      this.pending = null;
      this.box.readOnly = false;
      this.say('');
      this.buttons('Cancel', 'Restore');
      this.box.focus();
    } else {
      this.close();
    }
  }

  // Copy code / Restore / Yes, restore.
  go() {
    if (this.mode === 'backup') this.copy();
    else if (!this.pending) this.check();
    else this.apply();
  }

  async copy() {
    const code = this.box.value;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.say('Copied. Paste it somewhere safe, like your notes app.', 'good');
    } catch {
      // No clipboard access (some older or in-app browsers): select the code and try the old way.
      this.box.focus();
      this.box.setSelectionRange(0, code.length);
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      this.say(ok
        ? 'Copied. Paste it somewhere safe, like your notes app.'
        : 'The code is selected. Copy it by hand (on a phone, press and hold it, then tap Copy).', ok ? 'good' : '');
    }
  }

  // Reads the pasted code. Nothing changes yet: a good code moves on to "are you sure?".
  check() {
    try {
      this.pending = readCode(this.box.value);
    } catch (e) {
      this.say(e instanceof SaveCodeError ? e.message : MESSAGES.damaged, 'bad');
      this.box.focus();
      return;
    }
    const s = this.pending;
    const hands = `${s.stats.hands.toLocaleString('en-US')} hand${s.stats.hands === 1 ? '' : 's'} played`;
    this.box.readOnly = true;
    this.say(`This code has a bankroll of ${dollars(s.balance)} and ${hands}. `
      + `It replaces your ${dollars(this.h.bankroll())} bankroll, stats and settings here. Restore it?`, 'ask');
    this.buttons('Go back', 'Yes, restore');
    this.goBtn.focus();
  }

  apply() {
    const save = this.pending;
    const problem = this.h.restoreSave(save);
    if (problem) {
      this.say(problem, 'bad'); // e.g. a hand is being dealt: stay here so they can try again
      return;
    }
    this.close();
    this.toast(`Progress restored. Your bankroll is ${dollars(save.balance)}.`, 3.5);
  }

  buttons(cancelText, goText) {
    this.cancelBtn.textContent = cancelText;
    this.goBtn.textContent = goText;
  }

  // The line under the box. kind: '' | 'good' | 'bad' | 'ask' (just the colour).
  say(text, kind = '') {
    this.msg.textContent = text;
    this.msg.className = `code-msg ${kind}`;
  }

  onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.back();
    } else if (e.key === 'Tab') {
      // Keep keyboard focus inside the window while it's open (box, then the two buttons).
      const first = this.box;
      const last = this.goBtn;
      const now = document.activeElement;
      if (!this.root.contains(now) || (e.shiftKey ? now === first : now === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    }
  }
}
