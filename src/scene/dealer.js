import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tween, ease } from '../util/tween.js';

const UPPER = 0.31;
const FORE = 0.29;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// An android croupier in a tuxedo: porcelain head with a dark visor and warm eyes.
// Arms are solved with two-bone IK toward animated hand targets, so the dealer can
// genuinely reach for the shoe, the cards and the chips.
export class Dealer {
  constructor(lib) {
    this.root = new THREE.Group();
    this.root.name = 'dealer';
    this.time = 0;
    this.blink = 0;
    this.nextBlink = 2;

    const tux = lib.pbr('velour_velvet', {
      repeat: [4, 4], useDiffuse: false, color: new THREE.Color(0.022, 0.022, 0.026), roughness: 0.9,
    });
    const satin = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.65 });
    this.porcelain = new THREE.MeshPhysicalMaterial({
      color: 0xd9d4cc, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color(1, 0.95, 0.9),
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.2 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.9, roughness: 0.3 });

    // --- Legs and torso.
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.88, 24), tux);
      leg.position.set(x, 0.44, 0);
      this.root.add(leg);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.07, 0.28, 3, 0.03), satin);
      shoe.position.set(x, 0.035, 0.06);
      this.root.add(shoe);
    }

    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.88, 0);
    this.root.add(this.torso);
    const torsoProfile = [
      [0.0, 0], [0.17, 0], [0.175, 0.08], [0.165, 0.2], [0.18, 0.34], [0.22, 0.44], [0.215, 0.5], [0.12, 0.54], [0.06, 0.555], [0, 0.555],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const jacket = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 48), tux);
    jacket.scale.set(1, 1, 0.62);
    jacket.castShadow = true;
    this.torso.add(jacket);

    // Shirt V, lapels, bow tie on the chest.
    const vShape = new THREE.Shape();
    vShape.moveTo(-0.085, 0.53);
    vShape.lineTo(0.085, 0.53);
    vShape.lineTo(0.0, 0.2);
    vShape.closePath();
    const shirtFront = new THREE.Mesh(new THREE.ShapeGeometry(vShape), shirt);
    shirtFront.position.z = 0.112;
    shirtFront.rotation.x = -0.08;
    this.torso.add(shirtFront);
    for (const s of [-1, 1]) {
      const lapel = new THREE.Shape();
      lapel.moveTo(0.085 * s, 0.53);
      lapel.lineTo(0.13 * s, 0.47);
      lapel.lineTo(0.05 * s, 0.29);
      lapel.lineTo(0.0, 0.2);
      lapel.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(lapel), satin);
      m.position.z = 0.116;
      m.rotation.x = -0.08;
      this.torso.add(m);
    }
    for (let i = 0; i < 3; i++) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), satin);
      stud.position.set(0, 0.44 - i * 0.06, 0.12 + i * 0.004);
      this.torso.add(stud);
    }
    const bow = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), satin);
      wing.rotation.z = (s * Math.PI) / 2;
      wing.position.x = s * 0.024;
      bow.add(wing);
    }
    bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), satin));
    bow.position.set(0, 0.52, 0.112);
    this.torso.add(bow);
    // Pocket square and name badge.
    const square = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.004), shirt);
    square.position.set(-0.12, 0.43, 0.105);
    square.rotation.y = -0.25;
    this.torso.add(square);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.003), chrome);
    badge.position.set(0.12, 0.42, 0.105);
    badge.rotation.y = 0.25;
    this.torso.add(badge);

    // --- Neck and head.
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.555, 0);
    this.torso.add(this.neck);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.04, 32, 1, true), shirt);
    collar.position.y = 0.01;
    this.neck.add(collar);
    const neckCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.1, 24), joint);
    neckCyl.position.y = 0.05;
    this.neck.add(neckCyl);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.13, 0.005);
    this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.porcelain);
    skull.scale.set(0.088, 0.115, 0.102);
    skull.position.y = 0.035;
    skull.castShadow = true;
    this.head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.porcelain);
    jaw.scale.set(0.07, 0.06, 0.085);
    jaw.position.set(0, -0.025, 0.01);
    this.head.add(jaw);
    // Visor: a dark glass band wrapping the front of the face.
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0.2 });
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.4, Math.PI * 0.16), visorMat);
    visor.scale.set(0.091, 0.118, 0.105);
    visor.position.y = 0.035;
    this.head.add(visor);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb45e, emissiveIntensity: 4 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.016, 4, 12), this.eyeMat);
      eye.rotation.z = Math.PI / 2;
      eye.position.set(s * 0.032, 0.042, 0.104);
      this.head.add(eye);
      this.eyes.push(eye);
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 12, 32), chrome);
      ear.rotation.y = Math.PI / 2;
      ear.position.set(s * 0.088, 0.03, 0);
      this.head.add(ear);
    }
    // Subtle seam line across the crown.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0015, 8, 64, Math.PI), joint);
    seam.position.y = 0.035;
    seam.scale.set(0.88, 1.15, 1);
    seam.rotation.y = Math.PI / 2;
    this.head.add(seam);

    // --- Arms (children of the root; posed by IK every frame).
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const shoulderAnchor = new THREE.Object3D();
      shoulderAnchor.position.set(0.205 * s, 0.47, 0.0);
      this.torso.add(shoulderAnchor);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.068, 24, 16), tux);
      pad.scale.set(1, 0.85, 0.85);
      shoulderAnchor.add(pad);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, UPPER, 20), tux);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, FORE, 20), tux);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.047, 16, 12), tux);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 20), shirt);
      const link = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), chrome);
      const hand = this.buildHand(s, joint);
      for (const m of [upper, fore, elbow, cuff]) m.castShadow = true;
      this.root.add(upper, fore, elbow, cuff, link, hand);
      const rest = new THREE.Vector3(0.24 * s, 0.86, 0.3);
      this.arms[side] = {
        side, s, shoulderAnchor, upper, fore, elbow, cuff, link, hand,
        target: rest.clone(), rest, follow: null, followOffset: new THREE.Vector3(),
      };
    }

    this.lookTarget = new THREE.Vector3(0, 1.2, 1.1);
    this.headDir = new THREE.Vector2();
    this.lean = 0;

    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion() };
  }

  buildHand(s, joint) {
    // Fingers extend along +Y, palm faces -Z.
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.08, 0.026, 3, 0.011), this.porcelain);
    palm.position.y = 0.045;
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const len = [0.06, 0.07, 0.066, 0.052][i];
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, len, 4, 10), this.porcelain);
      finger.position.set((-0.027 + i * 0.018) * s, 0.09 + len / 2, -0.002);
      finger.rotation.x = -0.25;
      hand.add(finger);
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), joint);
      knuckle.position.set((-0.027 + i * 0.018) * s, 0.087, 0.004);
      hand.add(knuckle);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.045, 4, 10), this.porcelain);
    thumb.position.set(-0.045 * s, 0.045, -0.012);
    thumb.rotation.z = 0.7 * s;
    hand.add(thumb);
    hand.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return hand;
  }

  // ---- Animation API (world-space targets) --------------------------------

  toLocal(world) {
    return this.root.worldToLocal(world.clone());
  }

  // Moves a hand to a world position over `duration` seconds.
  async reach(side, world, duration = 0.45, easing = ease.inOut) {
    const arm = this.arms[side];
    arm.follow = null;
    const from = arm.target.clone();
    const to = this.toLocal(world);
    await tween({ duration, easing, update: (k) => arm.target.lerpVectors(from, to, k) });
  }

  // Hand tracks an object (e.g. a card being slid) until released.
  follow(side, object, offset = new THREE.Vector3(0, 0.03, 0)) {
    const arm = this.arms[side];
    arm.follow = object;
    arm.followOffset.copy(offset);
  }

  release(side) {
    this.arms[side].follow = null;
  }

  async rest(side, duration = 0.5) {
    const arm = this.arms[side];
    arm.follow = null;
    const from = arm.target.clone();
    await tween({ duration, update: (k) => arm.target.lerpVectors(from, arm.rest, k) });
  }

  restBoth(duration = 0.5) {
    return Promise.all([this.rest('left', duration), this.rest('right', duration)]);
  }

  look(world) {
    this.lookTarget.copy(world);
  }

  // A small bow of the head, e.g. when announcing a result.
  async nod() {
    const base = this.head.rotation.x;
    await tween({ duration: 0.5, easing: ease.sine, update: (k) => { this.nodAmt = Math.sin(k * Math.PI) * 0.18; } });
    this.nodAmt = 0;
    this.head.rotation.x = base;
  }

  // ---- Per-frame update ---------------------------------------------------

  update(dt) {
    this.time += dt;
    const t = this.time;

    // Breathing and a lean toward whichever hand is reaching furthest.
    const reachZ = Math.max(this.arms.left.target.z, this.arms.right.target.z);
    const leanTarget = THREE.MathUtils.clamp((reachZ - 0.3) * 0.5, 0, 0.22);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 4);
    this.torso.rotation.x = 0.05 + this.lean + Math.sin(t * 1.3) * 0.006;
    this.torso.scale.setScalar(1 + Math.sin(t * 1.3) * 0.004);
    this.root.updateMatrixWorld(true);

    // Head look-at with limits, smoothed.
    const headWorld = this.head.getWorldPosition(this.tmp.a);
    const local = this.toLocal(this.lookTarget).sub(this.toLocal(headWorld));
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.3, 0.7);
    const k = Math.min(1, dt * 5);
    this.headDir.x += (yaw - this.headDir.x) * k;
    this.headDir.y += (pitch - this.headDir.y) * k;
    this.neck.rotation.y = this.headDir.x * 0.4;
    this.head.rotation.y = this.headDir.x * 0.6;
    this.head.rotation.x = this.headDir.y - this.lean * 0.6 + (this.nodAmt || 0) + Math.sin(t * 0.7) * 0.01;
    this.head.rotation.z = Math.sin(t * 0.45) * 0.02;

    // Blinking eyes.
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 1;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const open = 1 - Math.sin(this.blink * Math.PI);
    for (const e of this.eyes) e.scale.set(1, 1, Math.max(0.1, open));
    this.eyeMat.emissiveIntensity = 3.5 + Math.sin(t * 2) * 0.4;

    this.root.updateMatrixWorld(true);
    for (const arm of Object.values(this.arms)) this.solveArm(arm, dt);
  }

  solveArm(arm) {
    const { a: S, b: E, c: W } = this.tmp;
    if (arm.follow) {
      const p = arm.follow.getWorldPosition(new THREE.Vector3()).add(arm.followOffset);
      arm.target.copy(this.toLocal(p));
    }
    arm.shoulderAnchor.getWorldPosition(S);
    S.copy(this.toLocal(S));
    // Natural idle sway when resting.
    const target = arm.target.clone();
    const toTarget = target.clone().sub(S);
    const maxReach = UPPER + FORE - 0.002;
    let d = toTarget.length();
    if (d > maxReach) {
      toTarget.multiplyScalar(maxReach / d);
      d = maxReach;
    }
    d = Math.max(d, 0.08);
    const dir = toTarget.clone().normalize();
    const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    // Elbows point down and out.
    const pole = new THREE.Vector3(arm.s * 0.6, -1, -0.25).normalize();
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    E.copy(S).addScaledVector(dir, a).addScaledVector(perp, h);
    W.copy(S).add(toTarget);

    this.placeSegment(arm.upper, S, E);
    this.placeSegment(arm.fore, E, W);
    arm.elbow.position.copy(E);

    const foreDir = W.clone().sub(E).normalize();
    arm.cuff.position.copy(W).addScaledVector(foreDir, -0.01);
    arm.cuff.quaternion.setFromUnitVectors(Y_AXIS, foreDir);
    arm.link.position.copy(W).addScaledVector(foreDir, -0.01).add(new THREE.Vector3(0, -0.035, 0));

    // Hand: fingers continue the forearm but flatten toward the table, palm down.
    const yAxis = foreDir.clone();
    yAxis.y *= 0.25;
    yAxis.y -= 0.18;
    yAxis.normalize();
    const zAxis = new THREE.Vector3(0, 1, 0).addScaledVector(yAxis, -yAxis.y).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    this.tmp.m.makeBasis(xAxis, yAxis, zAxis);
    arm.hand.quaternion.setFromRotationMatrix(this.tmp.m);
    arm.hand.position.copy(W);
  }

  placeSegment(mesh, from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
    mesh.scale.set(1, len / (mesh.geometry.parameters.height || len), 1);
  }
}
