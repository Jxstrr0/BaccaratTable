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
    on('btn-reveal', () => handlers.reveal());
    on('btn-rotate', () => handlers.rotate());
    on('btn-settings', () => $('settings').classList.toggle('hidden'));
    on('btn-help', () => $('help').classList.remove('hidden'));
    on('btn-help-close', () => $('help').classList.add('hidden'));
    on('btn-reset', () => handlers.resetBankroll());

    for (const id of ['opt-squeeze', 'opt-voice', 'opt-sound', 'opt-fast']) {
      $(id).addEventListener('change', () => handlers.setting(id.slice(4), $(id).checked));
    }
    for (const id of ['opt-music', 'opt-sfx']) {
      $(id).addEventListener('input', () => handlers.setting(id.slice(4), parseFloat($(id).value)));
    }
  }

  show() {
    $('hud').classList.remove('hidden');
  }

  applySettings(s) {
    $('opt-squeeze').checked = s.squeeze;
    $('opt-voice').checked = s.voice;
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

  // phase: 'betting' | 'dealing' | 'squeeze'
  setPhase(phase, { canDeal = false, canRebet = false, hasBets = false, showHint = true } = {}) {
    $('bet-bar').classList.toggle('hidden', phase === 'squeeze');
    $('squeeze-bar').classList.toggle('hidden', phase !== 'squeeze');
    const betting = phase === 'betting';
    $('btn-deal').disabled = !(betting && canDeal);
    $('btn-clear').disabled = !(betting && hasBets);
    $('btn-undo').disabled = !(betting && hasBets);
    $('btn-double').disabled = !(betting && hasBets);
    $('btn-rebet').disabled = !(betting && canRebet && !hasBets);
    $('hint').style.opacity = betting && showHint ? 1 : 0;
  }

  banner({ title, kind, score, net }) {
    const el = $('banner');
    el.innerHTML = '';
    const t = document.createElement('div');
    t.className = `title ${kind || ''}`;
    t.textContent = title;
    el.appendChild(t);
    if (score) {
      const s = document.createElement('div');
      s.className = 'score';
      s.textContent = score;
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
