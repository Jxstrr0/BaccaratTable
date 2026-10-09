import * as THREE from 'three';
import { CARD_W, CARD_H, TABLE_Y } from '../scene/layout.js';
import { tween, ease } from '../util/tween.js';

// Lets the player bend face-down cards up from any edge or corner with the mouse/touch,
// the way high rollers "squeeze" baccarat cards. Pull far enough and the card turns over.
export class Squeeze {
  constructor({ camera, dom, audio, onChange }) {
    this.camera = camera;
    this.dom = dom;
    this.audio = audio;
    this.onChange = onChange;
    this.cards = [];
    this.active = null;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE_Y + 0.001));
    this.resolve = null;

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onDbl = this.onDbl.bind(this);
  }

  // Runs until every card has been revealed.
  run(cards) {
    this.cards = cards.filter((c) => !c.faceUp);
    if (!this.cards.length) return Promise.resolve();
    this.dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.dom.addEventListener('dblclick', this.onDbl);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  stop() {
    this.dom.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('dblclick', this.onDbl);
    this.active = null;
  }

  pick(e) {
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const meshes = this.cards.filter((c) => !c.faceUp && !c.busy).flatMap((c) => [c.backMesh, c.faceMesh]);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    return hit ? { card: hit.object.userData.card, point: hit.point } : null;
  }

  // Pointer position projected to the card's rest plane, in card-local (x, y).
  localPoint(e, card) {
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    card.body.updateMatrixWorld(true);
    const local = card.body.worldToLocal(p);
    return new THREE.Vector2(local.x, local.y);
  }

  onDown(e) {
    if (e.button !== 0) return;
    const hit = this.pick(e);
    if (!hit) return;
    const { card } = hit;
    const start = this.localPoint(e, card);
    if (!start) return;
    // Lift from the edge or corner nearest the grab point; the curl travels inward.
    const hw = CARD_W / 2;
    const hh = CARD_H / 2;
    const nx = start.x / hw;
    const ny = start.y / hh;
    let dir;
    if (Math.abs(nx) > 0.45 && Math.abs(ny) > 0.6) dir = new THREE.Vector2(-Math.sign(nx) * hh, -Math.sign(ny) * hw);
    else if (hw - Math.abs(start.x) < hh - Math.abs(start.y)) dir = new THREE.Vector2(-Math.sign(start.x), 0);
    else dir = new THREE.Vector2(0, -Math.sign(start.y) || 1);
    dir.normalize();
    // Maximum travel = card extent along the direction.
    const extent = Math.abs(dir.x) * CARD_W + Math.abs(dir.y) * CARD_H;
    if (card.curl.amount > 0.002 && card.curl.dir.dot(dir) < 0.95) card.setCurl(0);
    this.active = { card, start, dir, extent, base: card.curl.dir.dot(dir) > 0.95 ? card.curl.amount : 0 };
    this.dom.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  }

  onMove(e) {
    if (!this.active) {
      // Cursor hint.
      const hit = this.pick(e);
      this.dom.style.cursor = hit ? 'grab' : '';
      return;
    }
    this.dom.style.cursor = 'grabbing';
    const { card, start, dir, extent, base } = this.active;
    const p = this.localPoint(e, card);
    if (!p) return;
    const pulled = p.clone().sub(start).dot(dir) * 1.25 + base;
    const amount = THREE.MathUtils.clamp(pulled, 0, extent * 1.05);
    card.setCurl(amount, dir);
    this.active.amount = amount;
    this.audio?.cardPeel(amount / extent);
    this.onChange?.(card, amount / extent);
  }

  onUp() {
    if (!this.active) return;
    const { card, extent } = this.active;
    const amount = card.curl.amount;
    this.active = null;
    this.dom.style.cursor = '';
    this.audio?.cardPeelEnd();
    if (amount / extent > 0.72) {
      this.reveal(card);
    } else if (amount > 0) {
      // Card settles back down but stays slightly bent if the player only peeked.
      const keep = 0;
      tween({ duration: 0.25, easing: ease.out, update: (k) => card.setCurl(amount + (keep - amount) * k) });
    }
  }

  onDbl(e) {
    const hit = this.pick(e);
    if (hit) this.reveal(hit.card);
  }

  revealAll() {
    for (const c of [...this.cards]) if (!c.faceUp) this.reveal(c);
  }

  // Rotates the most recently touched (or first) unrevealed card by 90°, so it can be squeezed from the side.
  rotate() {
    const card = this.cards.find((c) => !c.faceUp && !c.busy);
    if (!card) return;
    card.setCurl(0);
    card.busy = true;
    const r0 = card.root.rotation.y;
    tween({ duration: 0.3, update: (k) => { card.root.rotation.y = r0 + (Math.PI / 2) * k; } }).then(() => { card.busy = false; });
  }

  async reveal(card) {
    if (card.faceUp || card.busy) return;
    card.busy = true;
    const curl0 = card.curl.amount;
    this.audio?.cardFlip();
    await tween({
      duration: 0.42,
      easing: ease.inOut,
      update: (k) => {
        card.setCurl(curl0 * (1 - k));
        card.pivot.rotation.z = Math.PI * k;
        card.pivot.position.y = Math.sin(k * Math.PI) * 0.05;
      },
    });
    card.setFaceUp(true);
    card.busy = false;
    this.onChange?.(card, 1);
    if (this.cards.every((c) => c.faceUp)) {
      this.stop();
      const done = this.resolve;
      this.resolve = null;
      done?.();
    }
  }
}
