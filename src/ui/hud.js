import { DENOMS } from '../scene/chips.js';
import { makeChipTextures } from '../scene/textures.js';

const $ = (id) => document.getElementById(id);
export const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

// DOM overlay: bankroll, chip selector, actions, result banner, bead road and settings.
export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.chipButtons = new Map();
    const chips = $('chips');
    DENOMS.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.title = `${money(d)} chip (${i + 1})`;
      b.style.backgroundImage = `url(${makeChipTextures(d).face.image.toDataURL()})`;
      b.addEventListener('click', () => handlers.selectChip(d));
      chips.appendChild(b);
      this.chipButtons.set(d, b);
    });

    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('btn-deal', () => handlers.deal());
    on('btn-clear', () => handlers.clear());
    on('btn-undo', () => handlers.undo());
    on('btn-rebet', () => handlers.rebet());
    on('btn-double', () => handlers.double());
    on('btn-settings', () => $('settings').classList.toggle('hidden'));
    on('btn-help', () => $('help').classList.remove('hidden'));
    on('btn-help-close', () => $('help').classList.add('hidden'));
    on('btn-reset', () => handlers.resetBankroll());

    for (const id of ['opt-sound', 'opt-fast']) {
      $(id).addEventListener('change', () => handlers.setting(id.slice(4), $(id).checked));
    }
    for (const id of ['opt-music', 'opt-sfx']) {
      $(id).addEventListener('input', () => handlers.setting(id.slice(4), parseFloat($(id).value)));
    }
  }

  // Swap mouse wording for touch wording on phones and tablets.
  useTouchHints() {
    $('hint').textContent = 'Tap a spot to bet · hold to take a chip back · drag to look around · pinch to lean in';
  }

  show() {
    $('hud').classList.remove('hidden');
  }

  applySettings(s) {
    $('opt-sound').checked = s.sound;
    $('opt-fast').checked = s.fast;
    $('opt-music').value = s.music;
    $('opt-sfx').value = s.sfx;
  }

  setBalance(balance, onTable) {
    $('balance').textContent = money(balance);
    $('bet-total').textContent = money(onTable);
    for (const [d, b] of this.chipButtons) b.disabled = d > balance;
  }

  setLastNet(net) {
    const el = $('last-net');
    el.textContent = net == null ? '—' : `${net > 0 ? '+' : ''}${money(net)}`;
    el.style.color = net > 0 ? '#b8f5c9' : '';
  }

  selectChip(denom) {
    for (const [d, b] of this.chipButtons) b.classList.toggle('selected', d === denom);
  }

  // phase: 'betting' | 'dealing'
  setPhase(phase, { canDeal = false, canRebet = false, hasBets = false, showHint = true } = {}) {
    const betting = phase === 'betting';
    $('btn-deal').disabled = !(betting && canDeal);
    $('btn-clear').disabled = !(betting && hasBets);
    $('btn-undo').disabled = !(betting && hasBets);
    $('btn-double').disabled = !(betting && hasBets);
    $('btn-rebet').disabled = !(betting && canRebet && !hasBets);
    $('hint').style.opacity = betting && showHint ? 1 : 0;
  }

  // Result banner: who won, both totals side by side, and what it meant for the player.
  banner({ title, kind, player, banker, net }) {
    const el = $('banner');
    el.innerHTML = '';
    const t = document.createElement('div');
    t.className = `title ${kind || ''}`;
    t.textContent = title;
    el.appendChild(t);
    if (player != null) {
      const s = document.createElement('div');
      s.className = 'totals';
      for (const [side, total] of [['player', player], ['banker', banker]]) {
        const col = document.createElement('div');
        col.className = `total ${side}${kind === side ? ' won' : ''}`;
        col.innerHTML = `<span class="label">${side === 'player' ? 'Player' : 'Banker'}</span><span class="num">${total}</span>`;
        s.appendChild(col);
      }
      el.appendChild(s);
    }
    if (net != null) {
      const n = document.createElement('div');
      n.className = `net ${net > 0 ? 'win' : 'loss'}`;
      n.textContent = net > 0 ? `You win ${money(net)}` : net < 0 ? `${money(net)}` : 'Push';
      el.appendChild(n);
    }
    el.classList.add('show');
  }

  hideBanner() {
    $('banner').classList.remove('show');
  }

  // A large, short-lived call-out for each step of the coup ("Player draws").
  callout(text, sub = '', seconds = 1.8) {
    const el = $('callout');
    el.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'main';
    main.textContent = text;
    el.appendChild(main);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'sub';
      s.textContent = sub;
      el.appendChild(s);
    }
    el.classList.remove('show');
    void el.offsetWidth; // restart the entrance animation
    el.classList.add('show');
    clearTimeout(this.calloutTimer);
    this.calloutTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
  }

  // Score badge beside each hand: every card with its point value, and the running total.
  // cards: [{ rank, suit, value, faceUp }]; state: '' | 'won' | 'lost'.
  setHand(side, { cards, total, natural = false, state = '' }) {
    const el = $(`score-${side}`);
    el.classList.remove('hidden');
    el.classList.toggle('won', state === 'won');
    el.classList.toggle('lost', state === 'lost');
    const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const row = el.querySelector('.cards');
    row.innerHTML = '';
    let shown = 0;
    for (const c of cards) {
      const m = document.createElement('span');
      if (c.faceUp) {
        shown++;
        m.className = `mini${c.suit === 'H' || c.suit === 'D' ? ' red' : ''}`;
        m.innerHTML = `<b>${c.rank}${suits[c.suit]}</b><i>${c.value}</i>`;
      } else {
        m.className = 'mini back';
      }
      row.appendChild(m);
    }
    el.querySelector('.total').textContent = shown ? total : '–';
    el.querySelector('.tag').textContent = natural ? 'Natural' : '';
  }

  hideHands() {
    for (const side of ['player', 'banker']) $(`score-${side}`).classList.add('hidden');
  }

  // Pins a score badge to a screen position (px), centred horizontally.
  placeHand(side, x, y, visible) {
    const el = $(`score-${side}`);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, 0)`;
    el.style.visibility = visible ? 'visible' : 'hidden';
  }

  toast(text, seconds = 2.4) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
  }

  setRoad(history) {
    const grid = $('road-grid');
    grid.innerHTML = '';
    const recent = history.slice(-60);
    for (const h of recent) {
      const b = document.createElement('div');
      b.className = `bead ${h.w}${h.pp ? ' pp' : ''}${h.bp ? ' bp' : ''}`;
      b.textContent = h.w === 'T' ? h.t : h.w === 'P' ? h.p : h.b;
      grid.appendChild(b);
    }
    const count = (w) => history.filter((h) => h.w === w).length;
    $('cnt-p').textContent = `P ${count('P')}`;
    $('cnt-b').textContent = `B ${count('B')}`;
    $('cnt-t').textContent = `T ${count('T')}`;
  }

  setStats(stats) {
    $('stats').innerHTML = `Hands played <b>${stats.hands}</b><br>Biggest win <b>${money(stats.biggestWin)}</b><br>Session net <b>${money(stats.sessionNet)}</b>`;
  }
}
