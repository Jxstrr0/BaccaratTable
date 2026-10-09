import * as THREE from 'three';
import { Shoe, playCoup, handTotal, settle, isPair, isNatural, BET_KEYS } from './baccarat.js';
import { Card3D } from '../scene/cards.js';
import { ChipStack, DENOMS, breakdown } from '../scene/chips.js';
import {
  TABLE_Y, ZONES, zoneAt, zoneCenter, CARD_SPOTS, DISCARD_POS, FLOAT_POS, PLAYER_CHIPS,
} from '../scene/layout.js';
import { tween, wait, ease, setTimeScale } from '../util/tween.js';
import { money } from '../ui/hud.js';

const STORE = 'penthouse-baccarat-v1';
const START_BANKROLL = 100000;
const LIMITS = { player: 100000, banker: 100000, tie: 10000, playerPair: 10000, bankerPair: 10000 };
const SIDE_NAME = { player: 'Player', banker: 'Banker' };
const ZONE_BY_KEY = Object.fromEntries(ZONES.map((z) => [z.key, z]));

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

// Orchestrates a private Punto Banco table: betting, dealing, the reveal, settlement.
export class Game {
  constructor({ stage, table, dealer, rig, audio, hud }) {
    Object.assign(this, { stage, table, dealer, rig, audio, hud });
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.dom = stage.renderer.domElement;
    this.aniso = Math.min(8, stage.maxAnisotropy);

    const saved = loadState();
    this.balance = Number.isFinite(saved.balance) ? saved.balance : START_BANKROLL;
    this.settings = { voice: true, sound: true, music: 0.35, sfx: 0.8, fast: false, ...saved.settings };
    this.stats = { hands: 0, biggestWin: 0, ...saved.stats, sessionNet: 0 };
    // Keep only bets that still exist on the layout (older saves may hold retired side bets).
    this.lastBets = saved.lastBets
      ? Object.fromEntries(Object.entries(saved.lastBets).filter(([k, v]) => BET_KEYS.includes(k) && v > 0))
      : null;
    this.tutorialDone = !!saved.tutorialDone;
    this.history = [];

    this.state = 'intro';
    this.selected = DENOMS[2];
    this.bets = Object.fromEntries(BET_KEYS.map((k) => [k, 0]));
    this.undoStack = [];
    this.cards = { player: [], banker: [] };
    this.discardCount = 0;
    this.shoe = new Shoe(8);

    this.betStacks = {};
    this.winStacks = {};
    for (const zone of ZONES) {
      const c = zoneCenter(zone);
      this.betStacks[zone.key] = new ChipStack(this.scene, c.x, c.z, this.aniso);
      this.winStacks[zone.key] = new ChipStack(this.scene, c.x + 0.05, c.z, this.aniso);
    }
    this.playerStacks = {};
    DENOMS.forEach((d, i) => {
      const x = PLAYER_CHIPS.x + (i - 2) * PLAYER_CHIPS.spacing;
      this.playerStacks[d] = new ChipStack(this.scene, x, PLAYER_CHIPS.z, this.aniso);
    });
    this.rebuildPlayerStacks();

    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hoverZone = null;

    this.dom.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.dom.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.dom.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.dom.addEventListener('pointercancel', () => this.cancelLongPress());
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.applySettings();
    this.refreshHud();
    this.hud.selectChip(this.selected);
    this.hud.setRoad(this.history);
    this.hud.setStats(this.stats);
  }

  // ---- Persistence & settings ---------------------------------------------

  persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        balance: this.balance, settings: this.settings, lastBets: this.lastBets, tutorialDone: this.tutorialDone,
        stats: { hands: this.stats.hands, biggestWin: this.stats.biggestWin },
      }));
    } catch {
      /* storage unavailable: play on without saving */
    }
  }

  applySettings() {
    const s = this.settings;
    this.hud.applySettings(s);
    this.audio.voiceEnabled = s.voice;
    this.audio.setMuted(!s.sound);
    this.audio.setMusicVolume(s.music);
    this.audio.setSfxVolume(s.sfx);
    setTimeScale(s.fast ? 1.8 : 1);
  }

  setting(key, value) {
    this.settings[key] = value;
    this.applySettings();
    this.persist();
  }

  // ---- HUD ----------------------------------------------------------------

  get onTable() {
    return BET_KEYS.reduce((s, k) => s + this.bets[k], 0);
  }

  refreshHud() {
    const hasBets = this.onTable > 0;
    this.hud.setBalance(this.balance, this.onTable);
    const phase = this.state === 'betting' ? 'betting' : 'dealing';
    const lastTotal = this.lastBets ? Object.values(this.lastBets).reduce((s, v) => s + v, 0) : 0;
    this.hud.setPhase(phase, { canDeal: hasBets, hasBets, canRebet: lastTotal > 0 && lastTotal <= this.balance, showHint: !this.tutorialDone });
  }

  // The dealer's speaking light follows the voice: word events pulse it, and a length-based
  // estimate keeps it going when the voice is muted or reports nothing.
  say(text) {
    const seconds = 0.3 + text.length * 0.062;
    this.dealer.talk(seconds);
    this.audio.speak(text, {
      onStart: () => this.dealer.talk(seconds),
      onBoundary: () => this.dealer.syllable(),
      onEnd: () => this.dealer.stopTalking(),
    });
  }

  // ---- Chips on the rail --------------------------------------------------

  // How the bankroll is shown as physical stacks: a spread across denominations.
  rebuildPlayerStacks() {
    let rest = this.balance;
    const plan = [[100, 20, 0.05], [500, 16, 0.1], [1000, 16, 0.15], [5000, 14, 0.3], [25000, 18, 1]];
    for (const [d, cap, share] of plan) {
      const n = Math.min(cap, Math.floor((rest * share) / d));
      rest -= n * d;
      this.playerStacks[d].set(Array(n).fill(d));
    }
  }

  selectChip(denom) {
    this.selected = denom;
    this.hud.selectChip(denom);
    this.audio.uiClick();
  }

  async placeChip(key, denom = this.selected, { silent = false } = {}) {
    if (this.state !== 'betting') return false;
    if (denom > this.balance) {
      if (!silent) this.hud.toast('Not enough in your bankroll for that chip');
      return false;
    }
    if (this.bets[key] + denom > LIMITS[key]) {
      if (!silent) this.hud.toast(`${ZONE_BY_KEY[key].label} limit is ${money(LIMITS[key])}`);
      return false;
    }
    this.balance -= denom;
    this.bets[key] += denom;
    this.undoStack.push({ key, denom });
    const source = this.playerStacks[denom];
    const from = source.chips.length ? source.chips[source.chips.length - 1].position.clone() : source.base.clone().setY(TABLE_Y + 0.01);
    source.popTop();
    this.refreshHud();
    this.audio.chipStack();
    await this.betStacks[key].fly(denom, from, { duration: 0.38, arc: 0.06 });
    return true;
  }

  async takeBack(key) {
    if (this.state !== 'betting') return;
    const stack = this.betStacks[key];
    const top = stack.chips[stack.chips.length - 1];
    if (!top) return;
    const denom = top.userData.denom;
    const from = top.position.clone();
    stack.popTop();
    this.bets[key] -= denom;
    this.balance += denom;
    const i = this.undoStack.map((u) => u.key).lastIndexOf(key);
    if (i >= 0) this.undoStack.splice(i, 1);
    this.refreshHud();
    this.audio.chipStack();
    await this.playerStacks[denom].fly(denom, from, { duration: 0.32, arc: 0.05 });
  }

  undo() {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last) this.takeBack(last.key);
  }

  async clear() {
    if (this.state !== 'betting' || !this.onTable) return;
    for (const key of BET_KEYS) {
      this.balance += this.bets[key];
      this.bets[key] = 0;
    }
    this.undoStack = [];
    this.audio.chipSlide();
    const stacks = Object.values(this.betStacks).filter((s) => s.chips.length);
    await Promise.all(stacks.map((s) => s.slideTo(PLAYER_CHIPS.x, PLAYER_CHIPS.z, 0.45)));
    stacks.forEach((s) => this.resetStack(s));
    this.rebuildPlayerStacks();
    this.refreshHud();
  }

  resetStack(stack) {
    stack.clear();
    const zone = ZONES.find((z) => this.betStacks[z.key] === stack || this.winStacks[z.key] === stack);
    const c = zoneCenter(zone);
    stack.base.set(c.x + (this.winStacks[zone.key] === stack ? 0.05 : 0), TABLE_Y, c.z);
  }

  async placeAmount(key, amount) {
    const chips = breakdown(amount);
    for (const d of chips) {
      if (!(await this.placeChip(key, d, { silent: true }))) return false;
    }
    return true;
  }

  async rebet() {
    if (this.state !== 'betting' || !this.lastBets || this.onTable) return;
    const total = Object.values(this.lastBets).reduce((s, v) => s + v, 0);
    if (total > this.balance) {
      this.hud.toast('Not enough in your bankroll to repeat that bet');
      return;
    }
    await Promise.all(Object.entries(this.lastBets).filter(([, v]) => v > 0).map(([k, v]) => this.placeAmount(k, v)));
  }

  async double() {
    if (this.state !== 'betting' || !this.onTable) return;
    if (this.onTable > this.balance) {
      this.hud.toast('Not enough in your bankroll to double');
      return;
    }
    const current = { ...this.bets };
    await Promise.all(Object.entries(current).filter(([, v]) => v > 0).map(([k, v]) => this.placeAmount(k, Math.min(v, LIMITS[k] - v))));
  }

  // ---- Input --------------------------------------------------------------

  feltPoint(e) {
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObject(this.table.felt, false)[0];
    return hit ? hit.point : null;
  }

  pickPlayerChip(e) {
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const chips = Object.values(this.playerStacks).flatMap((s) => s.chips);
    const hit = this.ray.intersectObjects(chips, false)[0];
    return hit ? hit.object.userData.denom : null;
  }

  onPointerDown(e) {
    this.downAt = { x: e.clientX, y: e.clientY, button: e.button, touch: e.pointerType === 'touch' };
    this.longPressed = false;
    this.cancelLongPress();
    if (e.pointerType !== 'touch' || this.state !== 'betting') return;
    // Touch stand-in for right-click: press and hold a betting spot to take a chip back.
    const p = this.feltPoint(e);
    const zone = p ? zoneAt(p.x, p.z) : null;
    if (!zone || !this.betStacks[zone.key].chips.length) return;
    this.longPressTimer = setTimeout(() => {
      if (this.rig.dragging || this.rig.multiTouch) return;
      this.longPressed = true;
      navigator.vibrate?.(12);
      this.takeBack(zone.key);
    }, 520);
  }

  cancelLongPress() {
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  onPointerMove(e) {
    const d = this.downAt;
    if (d?.touch && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 10) this.cancelLongPress();
    if (this.state !== 'betting' || this.rig.dragging || e.pointerType === 'touch') {
      this.hoverZone = null;
      return;
    }
    const p = this.feltPoint(e);
    const zone = p ? zoneAt(p.x, p.z) : null;
    this.hoverZone = zone ? zone.key : null;
    const overChip = !zone && this.pickPlayerChip(e);
    this.dom.style.cursor = zone || overChip ? 'pointer' : '';
  }

  onPointerUp(e) {
    this.cancelLongPress();
    const d = this.downAt;
    const slop = d?.touch ? 10 : 6;
    if (!d || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > slop) return;
    // Pinches, look-drags and long-presses are not taps.
    if (this.longPressed || (d.touch && (this.rig.multiTouch || this.rig.dragging))) return;
    if (this.state === 'betting') this.audio.start();
    if (this.state !== 'betting') return;
    const p = this.feltPoint(e);
    const zone = p ? zoneAt(p.x, p.z) : null;
    if (d.button === 0) {
      if (zone) this.placeChip(zone.key);
      else {
        const denom = this.pickPlayerChip(e);
        if (denom) this.selectChip(denom);
      }
    } else if (d.button === 2 && zone) {
      this.takeBack(zone.key);
    }
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (this.state !== 'betting') return;
    if (k >= '1' && k <= '5') this.selectChip(DENOMS[Number(k) - 1]);
    else if (k === ' ' || k === 'enter') { e.preventDefault(); this.deal(); }
    else if (k === 'c') this.clear();
    else if (k === 'r') this.rebet();
    else if (k === 'd') this.double();
    else if (k === 'backspace') this.undo();
  }

  // ---- Round flow ---------------------------------------------------------

  async start() {
    this.state = 'seating';
    await this.rig.moveTo('seat', 3.2, ease.inOut);
    this.state = 'betting';
    this.refreshHud();
    this.say('Good evening, and welcome to the salon. Please place your bets.');
    this.hud.toast('Choose a chip, then click Player, Banker or a side bet', 4);
  }

  async deal() {
    if (this.state !== 'betting') return;
    if (!this.onTable) {
      this.hud.toast('Place a bet first');
      return;
    }
    this.state = 'dealing';
    this.hoverZone = null;
    this.lastBets = { ...this.bets };
    this.tutorialDone = true;
    this.persist();
    this.refreshHud();
    this.hud.hideBanner();
    this.say('No more bets.');

    while (this.dealer.busyGesture) await wait(0.1);
    if (this.shoe.cutReached) await this.newShoe();

    const coup = playCoup(() => this.shoe.draw());

    // Two cards each, alternating, face down.
    for (const step of coup.steps.slice(0, 4)) {
      await this.dealCard(step.side, step.index, coup[step.side][step.index]);
    }
    await this.dealer.restBoth(0.35);

    for (const side of ['player', 'banker']) {
      await this.dealerReveal(side, [0, 1]);
      const cards = coup[side].slice(0, 2);
      const total = handTotal(cards);
      this.hud.toast(`${SIDE_NAME[side]} ${total}${isNatural(cards) ? ' — natural' : ''}`);
      this.say(isNatural(cards) ? `${SIDE_NAME[side]}, natural ${total}.` : `${SIDE_NAME[side]}, ${total}.`);
      await wait(0.55);
    }

    for (const step of coup.steps.slice(4)) {
      this.say(`${SIDE_NAME[step.side]} draws.`);
      await this.dealCard(step.side, step.index, coup[step.side][step.index]);
      await this.dealer.rest('right', 0.3);
      await this.dealerReveal(step.side, [step.index]);
      const total = handTotal(coup[step.side]);
      this.hud.toast(`${SIDE_NAME[step.side]} ${total}`);
      await wait(0.45);
    }

    await this.resolve(coup);
    await this.collectCards();
    this.state = 'betting';
    for (const h of Object.values(this.table.highlights)) h.glow = 0;
    if (this.balance < DENOMS[0] && !this.onTable) {
      this.hud.toast('The house extends you a fresh $100,000 marker. Good luck.', 4);
      this.balance = START_BANKROLL;
      this.rebuildPlayerStacks();
      this.persist();
    }
    this.refreshHud();
    this.say('Place your bets.');
  }

  shoeMouth() {
    return this.table.shoe.localToWorld(this.table.shoe.userData.mouth.clone());
  }

  async dealCard(side, index, card) {
    const c3 = new Card3D(card, this.aniso);
    const mouth = this.shoeMouth();
    c3.root.position.copy(mouth);
    c3.root.rotation.y = this.table.shoe.rotation.y;
    this.scene.add(c3.root);
    this.cards[side][index] = c3;
    const spot = CARD_SPOTS[side][index];
    this.dealer.look(mouth);
    this.dealer.setGrip('right', 0.2);
    await this.dealer.reach('right', mouth.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.28);
    this.dealer.setGrip('right', 0.5);
    this.dealer.follow('right', c3.root, new THREE.Vector3(0, 0.035, 0));
    this.dealer.look(new THREE.Vector3(spot.x, TABLE_Y, spot.z));
    this.audio.cardSlide();
    const from = mouth.clone();
    const to = new THREE.Vector3(spot.x, TABLE_Y + 0.0008 + index * 0.0003, spot.z);
    const r0 = c3.root.rotation.y;
    await tween({
      duration: 0.5,
      easing: ease.out,
      update: (k) => {
        c3.root.position.lerpVectors(from, to, k);
        c3.root.rotation.y = r0 + (spot.rot - r0) * k;
      },
    });
    this.dealer.release('right');
    this.dealer.setGrip('right', 0.1);
  }

  async flipCard(c3) {
    this.audio.cardFlip();
    await tween({
      duration: 0.26,
      easing: ease.inOut,
      update: (k) => {
        c3.pivot.rotation.z = Math.PI * k;
        c3.pivot.position.y = Math.sin(k * Math.PI) * 0.045;
      },
    });
    c3.setFaceUp(true);
  }

  async dealerReveal(side, indices) {
    const arm = side === 'player' ? 'left' : 'right';
    for (const i of indices) {
      const c3 = this.cards[side][i];
      const p = c3.root.position.clone();
      this.dealer.look(p);
      this.dealer.setGrip(arm, 0.2);
      await this.dealer.reach(arm, p.clone().add(new THREE.Vector3(0, 0.04, -0.03)), 0.16);
      this.dealer.setGrip(arm, 0.5);
      await this.flipCard(c3);
      this.dealer.setGrip(arm, 0.1);
    }
    await this.dealer.rest(arm, 0.25);
  }

  // Open palm toward the winning hand (both hands on a tie).
  async presentWinner(winner) {
    const centre = (side) => {
      const spots = CARD_SPOTS[side].slice(0, 2);
      return new THREE.Vector3((spots[0].x + spots[1].x) / 2, TABLE_Y, spots[0].z);
    };
    if (winner === 'tie') {
      await Promise.all([this.dealer.present('left', centre('player'), 0.7), this.dealer.present('right', centre('banker'), 0.7)]);
    } else {
      this.dealer.look(centre(winner));
      await this.dealer.present(winner === 'player' ? 'left' : 'right', centre(winner), 0.7);
      this.dealer.look(this.camera.position);
    }
  }

  async resolve(coup) {
    const result = settle(this.bets, coup);
    const { winner, playerTotal: p, bankerTotal: b } = coup;
    const title = winner === 'tie' ? 'TIE' : `${SIDE_NAME[winner].toUpperCase()} WINS`;
    const score = winner === 'banker' ? `Banker ${b} · Player ${p}` : `Player ${p} · Banker ${b}`;
    this.hud.banner({ title, kind: winner, score, net: result.net });
    this.say(winner === 'tie' ? `Tie, ${p} all.` : `${SIDE_NAME[winner]} wins, ${Math.max(p, b)} over ${Math.min(p, b)}.`);
    this.dealer.look(this.camera.position);
    this.dealer.nod();
    await this.presentWinner(winner);

    // Glow every winning spot.
    for (const [key, line] of Object.entries(settle(Object.fromEntries(BET_KEYS.map((k) => [k, 1])), coup).lines)) {
      if (line.profit > 0) this.table.highlights[key].glow = 1;
    }

    // Losing chips go to the float; winners get paid alongside their stake.
    const floatPos = new THREE.Vector3(FLOAT_POS.x, TABLE_Y + 0.02, FLOAT_POS.z);
    const jobs = [];
    let paidChips = 0;
    for (const key of BET_KEYS) {
      const line = result.lines[key];
      if (!line) continue;
      const stack = this.betStacks[key];
      if (line.returned === 0) {
        jobs.push((async () => {
          await wait(0.6);
          this.audio.chipSlide();
          await stack.slideTo(FLOAT_POS.x, FLOAT_POS.z, 0.7);
          this.resetStack(stack);
        })());
      } else if (line.profit > 0) {
        const pay = breakdown(line.profit).slice(0, 40);
        jobs.push((async () => {
          await wait(0.9);
          for (const d of pay) {
            const from = floatPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0));
            this.audio.chipStack();
            await this.winStacks[key].fly(d, from, { duration: 0.32, arc: 0.07 });
            paidChips++;
          }
        })());
      }
    }
    if (jobs.length) {
      this.dealer.setGrip('left', -0.25);
      this.dealer.setGrip('right', -0.25);
      this.dealer.reach('left', new THREE.Vector3(-0.2, TABLE_Y + 0.05, FLOAT_POS.z + 0.08), 0.5);
      this.dealer.reach('right', new THREE.Vector3(0.2, TABLE_Y + 0.05, FLOAT_POS.z + 0.08), 0.5);
    }
    await Promise.all(jobs);
    this.dealer.restBoth(0.5);
    if (result.net > 0) this.audio.win(result.net >= 20000);
    else if (result.net < 0) this.audio.lose();
    await wait(paidChips ? 1.4 : 1.0);

    // Everything still on the layout comes back to the player.
    const returning = [...Object.values(this.betStacks), ...Object.values(this.winStacks)].filter((s) => s.chips.length);
    if (returning.length) {
      this.audio.chipSlide();
      await Promise.all(returning.map((s) => s.slideTo(PLAYER_CHIPS.x, PLAYER_CHIPS.z, 0.55)));
      returning.forEach((s) => this.resetStack(s));
    }

    this.balance += result.returned;
    for (const k of BET_KEYS) this.bets[k] = 0;
    this.undoStack = [];
    this.rebuildPlayerStacks();
    this.stats.hands++;
    this.stats.sessionNet += result.net;
    this.stats.biggestWin = Math.max(this.stats.biggestWin, result.net);
    this.history.push({
      w: winner === 'player' ? 'P' : winner === 'banker' ? 'B' : 'T',
      p, b, t: p,
      pp: isPair(coup.player), bp: isPair(coup.banker),
    });
    this.hud.setRoad(this.history);
    this.hud.setStats(this.stats);
    this.hud.setLastNet(result.net);
    this.persist();
    this.refreshHud();
  }

  async collectCards() {
    await wait(0.6);
    this.hud.hideBanner();
    const all = [...this.cards.player, ...this.cards.banker].filter(Boolean);
    const target = new THREE.Vector3(DISCARD_POS.x, TABLE_Y + 0.02, DISCARD_POS.z);
    const gather = new THREE.Vector3(0, TABLE_Y + 0.003, -0.34);
    // Both hands come down behind their hands' cards, palms flat, and sweep them to the middle.
    const over = (side) => {
      const s0 = CARD_SPOTS[side][0];
      const s1 = CARD_SPOTS[side][1];
      return new THREE.Vector3((s0.x + s1.x) / 2 + (side === 'player' ? -0.05 : 0.05), TABLE_Y + 0.035, s0.z - 0.06);
    };
    this.dealer.setGrip('left', 0);
    this.dealer.setGrip('right', 0);
    await Promise.all([this.dealer.reach('left', over('player'), 0.3), this.dealer.reach('right', over('banker'), 0.3)]);
    this.audio.cardSlide();
    const froms = all.map((c) => c.root.position.clone());
    const handFrom = {
      left: this.dealer.arms.left.target.clone(),
      right: this.dealer.arms.right.target.clone(),
    };
    const handTo = {
      left: this.dealer.toLocal(gather.clone().add(new THREE.Vector3(-0.07, 0.035, -0.04))),
      right: this.dealer.toLocal(gather.clone().add(new THREE.Vector3(0.07, 0.035, -0.04))),
    };
    await tween({
      duration: 0.45,
      update: (k) => {
        all.forEach((c, i) => c.root.position.lerpVectors(froms[i], gather.clone().setY(gather.y + i * 0.0004), k));
        this.dealer.arms.left.target.lerpVectors(handFrom.left, handTo.left, k);
        this.dealer.arms.right.target.lerpVectors(handFrom.right, handTo.right, k);
      },
    });
    // The left hand carries the stack to the discard holder.
    this.dealer.rest('right', 0.4);
    this.dealer.setGrip('left', 0.45);
    const mids = all.map((c) => c.root.position.clone());
    this.dealer.reach('left', target.clone().add(new THREE.Vector3(0.05, 0.03, 0)), 0.4);
    await tween({
      duration: 0.4,
      update: (k) => all.forEach((c, i) => {
        c.root.position.lerpVectors(mids[i], target, k);
        c.root.position.y += Math.sin(k * Math.PI) * 0.04;
      }),
    });
    for (const c of all) {
      this.scene.remove(c.root);
      c.dispose();
    }
    this.discardCount += all.length;
    const h = Math.min(0.055, this.discardCount * 0.00028);
    this.table.discardStack.scale.y = Math.max(0.0001, h);
    this.table.discardStack.position.y = TABLE_Y + h / 2;
    this.cards = { player: [], banker: [] };
    this.dealer.rest('left', 0.4);
    this.dealer.look(this.camera.position);
  }

  async newShoe() {
    this.hud.toast('The cut card is out. Shuffling a fresh eight-deck shoe…', 3);
    this.say('The cut card is out. A fresh shoe.');
    this.audio.cardSlide();
    await wait(1.4);
    this.shoe.reset();
    this.discardCount = 0;
    this.table.discardStack.scale.y = 0.0001;
    this.history = [];
    this.hud.setRoad(this.history);
    this.hud.toast(`New shoe. Burned ${this.shoe.burned.length} cards.`, 2.5);
    await wait(1);
  }

  resetBankroll() {
    if (this.state !== 'betting') {
      this.hud.toast('Finish the current hand first');
      return;
    }
    this.clear();
    this.balance = START_BANKROLL;
    this.stats = { hands: 0, biggestWin: 0, sessionNet: 0 };
    this.lastBets = null;
    this.rebuildPlayerStacks();
    this.hud.setStats(this.stats);
    this.hud.setLastNet(null);
    this.persist();
    this.refreshHud();
    this.hud.toast(`Bankroll reset to ${money(START_BANKROLL)}`);
  }

  // ---- Per frame ----------------------------------------------------------

  update(dt) {
    const t = performance.now() / 1000;
    for (const [key, h] of Object.entries(this.table.highlights)) {
      const hoverTarget = this.hoverZone === key ? 1 : 0;
      h.hover += (hoverTarget - h.hover) * Math.min(1, dt * 10);
      const glow = h.glow ? 0.16 + Math.sin(t * 4) * 0.06 : 0;
      h.mesh.material.opacity = Math.max(h.hover * 0.11, glow);
    }
    this.dealer.setIdle(this.state === 'betting');
    if (this.state === 'betting' || this.state === 'intro' || this.state === 'seating') {
      this.dealer.look(this.camera.position);
    }
  }
}
