import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tween, wait, ease } from '../util/tween.js';

const UPPER = 0.31;
const FORE = 0.29;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const JACKET_DEPTH = 0.62; // the lathe-turned torso is flattened front-to-back by this factor

// Torso silhouette (radius, height above the hips), smoothed with a spline.
const TORSO_PROFILE = new THREE.SplineCurve([
  [0.0, 0], [0.165, 0], [0.17, 0.06], [0.158, 0.16], [0.163, 0.26], [0.188, 0.36],
  [0.214, 0.44], [0.222, 0.49], [0.2, 0.53], [0.13, 0.555], [0.065, 0.57], [0.0, 0.572],
].map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(48);

// Torso radius at a height, interpolated along the profile.
function torsoRadius(y) {
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    const a = TORSO_PROFILE[i - 1];
    const b = TORSO_PROFILE[i];
    if ((a.y <= y && y <= b.y) || (b.y <= y && y <= a.y)) {
      const k = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * k;
    }
  }
  return 0;
}

// A point on the jacket's front surface, so trims and buttons sit exactly on the cloth.
function onChest(x, y, lift = 0.003) {
  const r = torsoRadius(y);
  const z = JACKET_DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
  return new THREE.Vector3(x, y, z + lift);
}

// Paints the tuxedo front (shirt, waistcoat, satin lapels, stitching) into the torso's UV space.
// The lathe's u runs around the body with the front at u = 0.5; v runs up the profile.
function paintJacket() {
  const W = 1024;
  const H = 1024;
  const colour = document.createElement('canvas');
  colour.width = W;
  colour.height = H;
  const rough = document.createElement('canvas');
  rough.width = W;
  rough.height = H;
  const g = colour.getContext('2d');
  const gr = rough.getContext('2d');

  // v for a height: profile points are evenly spaced in arc length, so search them.
  const vAt = (y) => {
    let best = 0;
    let bestD = Infinity;
    TORSO_PROFILE.forEach((p, i) => {
      if (i > TORSO_PROFILE.length - 4) return; // ignore the shoulder cap curling back in
      const d = Math.abs(p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best / (TORSO_PROFILE.length - 1);
  };
  // Canvas point for a horizontal offset (metres from the centre line) at a height.
  const pt = (x, y) => {
    const r = Math.max(0.01, torsoRadius(y));
    const u = 0.5 + Math.asin(Math.max(-1, Math.min(1, x / r))) / (Math.PI * 2);
    return [u * W, (1 - vAt(y)) * H];
  };
  const path = (ctx, pts, close = true) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const [px, py] = pt(x, y);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    if (close) ctx.closePath();
  };
  const fill = (pts, color, roughness) => {
    path(g, pts);
    g.fillStyle = color;
    g.fill();
    path(gr, pts);
    const r = Math.round(roughness * 255);
    gr.fillStyle = `rgb(${r},${r},${r})`;
    gr.fill();
  };
  const line = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n)]);

  // Wool base with a fine twill.
  g.fillStyle = '#0b0b0d';
  g.fillRect(0, 0, W, H);
  gr.fillStyle = 'rgb(220,220,220)';
  gr.fillRect(0, 0, W, H);
  g.globalAlpha = 0.06;
  for (let i = -H; i < W; i += 3) {
    g.strokeStyle = i % 2 ? '#2a2a30' : '#000';
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Waistcoat (charcoal, with a satin back-sheen) inside the jacket opening.
  fill([[-0.1, 0.545], [0.1, 0.545], [0.07, 0.3], [0.0, 0.14], [-0.07, 0.3]], '#1b1b20', 0.5);
  // Shirt V with pleats.
  fill([[-0.075, 0.55], [0.075, 0.55], [0.0, 0.33]], '#f1efe9', 0.75);
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 2;
  for (const x of [-0.03, -0.015, 0.015, 0.03]) {
    path(g, [[x, 0.54], [x * 0.3, 0.37]], false);
    g.stroke();
  }
  // Satin peak lapels following the jacket opening.
  for (const s of [-1, 1]) {
    fill([
      [0.1 * s, 0.548], [0.135 * s, 0.53], [0.15 * s, 0.505], [0.122 * s, 0.497],
      ...line(0.118 * s, 0.48, 0.05 * s, 0.26, 10), [0.035 * s, 0.25],
      ...line(0.06 * s, 0.33, 0.092 * s, 0.53, 8),
    ], '#050506', 0.3);
  }
  // Jacket front edges below the button.
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  for (const s of [-1, 1]) {
    path(g, line(0.035 * s, 0.25, 0.09 * s, 0.0, 10), false);
    g.stroke();
  }
  // Breast pocket welt.
  fill([[-0.15, 0.415], [-0.095, 0.425], [-0.095, 0.418], [-0.15, 0.408]], '#151518', 0.6);

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  return { map, roughnessMap };
}

// One finger segment: a porcelain capsule with a dark joint at its base, merged into a single
// vertex-coloured mesh so a whole hand costs only a handful of draw calls.
function phalanxGeometry(length, radius) {
  const tint = (geo, hex) => {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  };
  const bone = new THREE.CapsuleGeometry(radius, length, 4, 10);
  bone.translate(0, length / 2 + radius * 0.6, 0);
  const knuckle = new THREE.SphereGeometry(radius * 1.04, 10, 8);
  return mergeGeometries([tint(bone, 0xffffff), tint(knuckle, 0x2b2b30)]);
}

// An android croupier: sculpted porcelain head with a dark visor and light-bar eyes, a tailored
// tuxedo, and hands with jointed fingers. Arms are posed by two-bone IK toward animated targets.
export class Dealer {
  constructor(lib) {
    this.root = new THREE.Group();
    this.root.name = 'dealer';
    this.time = 0;
    this.blink = 0;
    this.nextBlink = 2;
    this.idle = false;
    this.nextIdleBeat = 6;
    this.busyGesture = false;
    this.talkLevel = 0;
    this.talkUntil = 0;
    this.nextSyllable = 0;
    this.nodAmt = 0;

    const velvet = lib.texture('velour_velvet_nor_gl.jpg', { repeat: [4, 4] });
    const { map: jacketMap, roughnessMap: jacketRough } = paintJacket();
    const jacketMat = new THREE.MeshStandardMaterial({
      map: jacketMap, roughnessMap: jacketRough, roughness: 1, normalMap: velvet, normalScale: new THREE.Vector2(0.35, 0.35),
    });
    const tux = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.85, normalMap: velvet, normalScale: new THREE.Vector2(0.35, 0.35) });
    const satin = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.7 });
    this.porcelain = new THREE.MeshPhysicalMaterial({
      color: 0xe2ddd4, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.1, sheen: 0.25, sheenColor: new THREE.Color(1, 0.95, 0.9),
    });
    const fingerMat = this.porcelain.clone();
    fingerMat.vertexColors = true;
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.22 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x26262b, metalness: 0.85, roughness: 0.32 });

    // --- Legs.
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.066, 0.88, 24), tux);
      leg.position.set(x, 0.44, 0);
      this.root.add(leg);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.86, 0.012), satin);
      stripe.position.set(x + Math.sign(x) * 0.073, 0.45, 0);
      this.root.add(stripe);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.07, 0.28, 3, 0.03), satin);
      shoe.position.set(x, 0.035, 0.06);
      this.root.add(shoe);
    }

    // --- Torso: lathe-turned jacket wearing the painted tuxedo front.
    this.hips = new THREE.Group();
    this.hips.position.set(0, 0.88, 0);
    this.root.add(this.hips);
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const jacket = new THREE.Mesh(new THREE.LatheGeometry(TORSO_PROFILE, 64, Math.PI), jacketMat);
    jacket.scale.set(1, 1, JACKET_DEPTH);
    jacket.castShadow = true;
    this.torso.add(jacket);

    // Brass waistcoat buttons, a jacket button, bow tie, pocket square, name badge.
    for (const y of [0.31, 0.26, 0.21]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), brass);
      b.position.copy(onChest(0, y, 0.002));
      this.torso.add(b);
    }
    const jacketButton = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), satin);
    jacketButton.rotation.x = Math.PI / 2;
    jacketButton.position.copy(onChest(0.012, 0.16, 0.003));
    this.torso.add(jacketButton);

    const bowShape = new THREE.Shape();
    bowShape.moveTo(0, 0);
    bowShape.bezierCurveTo(0.012, 0.016, 0.036, 0.02, 0.044, 0.012);
    bowShape.bezierCurveTo(0.048, 0.0, 0.048, -0.004, 0.044, -0.012);
    bowShape.bezierCurveTo(0.036, -0.02, 0.012, -0.016, 0, 0);
    const wingGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3 });
    const bow = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, satin);
      wing.scale.x = s;
      wing.position.z = -0.006;
      bow.add(wing);
    }
    bow.add(new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.018, 0.016, 2, 0.004), satin));
    bow.position.copy(onChest(0, 0.545, 0.012));
    this.torso.add(bow);

    const square = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.028, 3), shirt);
    square.position.copy(onChest(-0.122, 0.428, 0.004));
    this.torso.add(square);
    const square2 = square.clone();
    square2.position.x += 0.012;
    square2.scale.setScalar(0.8);
    this.torso.add(square2);
    const badge = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.012, 0.003, 2, 0.001), brass);
    badge.position.copy(onChest(0.12, 0.42, 0.002));
    badge.lookAt(badge.position.clone().add(new THREE.Vector3(0.6, 0, 1)));
    this.torso.add(badge);

    // --- Neck: wing collar over a segmented metal neck.
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.565, 0);
    this.torso.add(this.neck);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.042, 32, 1, true, Math.PI * 0.12, Math.PI * 1.76), shirt);
    collar.material = shirt.clone();
    collar.material.side = THREE.DoubleSide;
    collar.rotation.y = Math.PI;
    collar.position.y = 0.006;
    this.neck.add(collar);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036 - i * 0.002, 0.038 - i * 0.002, 0.02, 24), i % 2 ? joint : brass);
      ring.position.y = 0.03 + i * 0.022;
      this.neck.add(ring);
    }

    // --- Head: a lathe-sculpted porcelain shell.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.135, 0.004);
    this.neck.add(this.head);
    const skullProfile = [
      [0, -0.07], [0.032, -0.069], [0.055, -0.058], [0.07, -0.038], [0.08, -0.01], [0.088, 0.03],
      [0.088, 0.065], [0.08, 0.095], [0.064, 0.118], [0.04, 0.132], [0, 0.138],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const skull = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(skullProfile).getPoints(32), 64), this.porcelain);
    skull.scale.set(1, 1, 1.14);
    skull.castShadow = true;
    this.head.add(skull);

    // Visor band across the eyes: a slice of a slightly larger lathe in dark glass.
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0.3 });
    const visorProfile = [[0.0905, 0.012], [0.0915, 0.03], [0.0912, 0.05], [0.0895, 0.064]].map(([r, y]) => new THREE.Vector2(r, y));
    const visor = new THREE.Mesh(new THREE.LatheGeometry(visorProfile, 48, -Math.PI * 0.36, Math.PI * 0.72), visorMat);
    visor.scale.set(1, 1, 1.14);
    this.head.add(visor);

    // Light-bar eyes on the visor and a speaking light below them.
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb45e, emissiveIntensity: 4 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.02, 4, 12), this.eyeMat);
      const a = s * 0.33;
      eye.position.set(Math.sin(a) * 0.0925, 0.038, Math.cos(a) * 0.0925 * 1.14);
      eye.rotation.set(0, a, Math.PI / 2);
      this.head.add(eye);
      this.eyes.push(eye);
    }
    this.mouthMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb45e, emissiveIntensity: 0.6 });
    this.mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.0022, 0.028, 4, 10), this.mouthMat);
    this.mouth.rotation.set(-0.25, 0, Math.PI / 2);
    this.mouth.position.set(0, -0.032, 0.0815 * 1.14);
    this.head.add(this.mouth);
    // Face-plate seam and ear modules with status lights.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.0012, 6, 64, Math.PI * 0.9), joint);
    seam.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
    seam.scale.set(1.14, 1, 1);
    seam.position.set(0, 0.02, 0.006);
    this.head.add(seam);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0045, 10, 32), brass);
      ear.rotation.y = Math.PI / 2;
      ear.position.set(s * 0.087, 0.03, 0);
      this.head.add(ear);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 24), joint);
      disc.rotation.z = Math.PI / 2;
      disc.position.set(s * 0.087, 0.03, 0);
      this.head.add(disc);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), this.eyeMat);
      led.position.set(s * 0.09, 0.03, 0.006);
      this.head.add(led);
    }

    // --- Arms (children of the root; posed by IK every frame).
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const shoulderAnchor = new THREE.Object3D();
      shoulderAnchor.position.set(0.2 * s, 0.475, 0.0);
      this.torso.add(shoulderAnchor);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 16), tux);
      pad.scale.set(1.05, 0.82, 0.9);
      shoulderAnchor.add(pad);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.047, UPPER, 24), tux);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.041, FORE, 24), tux);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 18, 12), tux);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.032, 24), shirt);
      const link = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.012, 0.005, 2, 0.002), brass);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.03, 16), joint);
      for (const m of [upper, fore, elbow, cuff]) m.castShadow = true;
      const hand = this.buildHand(s, fingerMat);
      this.root.add(upper, fore, elbow, cuff, link, wrist, hand.group);
      // At rest the hands sit together on the table edge.
      const rest = new THREE.Vector3(0.07 * s, 0.81, 0.35);
      this.arms[side] = {
        side, s, shoulderAnchor, upper, fore, elbow, cuff, link, wrist, hand,
        target: rest.clone(), rest, follow: null, followOffset: new THREE.Vector3(),
        grip: 0.15, gripTarget: 0.15, roll: 0, rollTarget: 0,
      };
    }

    this.lookTarget = new THREE.Vector3(0, 1.2, 1.1);
    this.glance = null; // temporary look target during idle glances
    this.headDir = new THREE.Vector2();
    this.lean = 0;
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), m: new THREE.Matrix4() };
  }

  // Hand: fingers extend along +Y and the palm faces -Z. Each finger has three posable segments.
  buildHand(s, fingerMat) {
    const group = new THREE.Group();
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.074, 0.082, 0.026, 3, 0.011), this.porcelain);
    palm.position.y = 0.045;
    palm.castShadow = true;
    group.add(palm);
    const fingers = [];
    const specs = [
      { x: -0.026, lens: [0.026, 0.018, 0.014], r: 0.0082 },
      { x: -0.009, lens: [0.029, 0.02, 0.015], r: 0.0085 },
      { x: 0.009, lens: [0.027, 0.019, 0.014], r: 0.0082 },
      { x: 0.025, lens: [0.021, 0.015, 0.012], r: 0.0075 },
    ];
    for (const [i, spec] of specs.entries()) {
      const base = new THREE.Group();
      base.position.set(spec.x * s, 0.088, -0.002);
      group.add(base);
      let parent = base;
      const segs = [];
      for (const len of spec.lens) {
        const seg = new THREE.Mesh(phalanxGeometry(len, spec.r), fingerMat);
        parent.add(seg);
        segs.push(seg);
        const next = new THREE.Group();
        next.position.y = len + spec.r * 1.2;
        seg.add(next);
        parent = next;
      }
      fingers.push({ base, segs, spread: (i - 1.5) * s });
    }
    // Thumb: two segments set into the side of the palm, angled across it.
    const thumbBase = new THREE.Group();
    thumbBase.position.set(-0.04 * s, 0.03, -0.01);
    group.add(thumbBase);
    const t1 = new THREE.Mesh(phalanxGeometry(0.026, 0.0095), fingerMat);
    thumbBase.add(t1);
    const tj = new THREE.Group();
    tj.position.y = 0.037;
    t1.add(tj);
    const t2 = new THREE.Mesh(phalanxGeometry(0.02, 0.009), fingerMat);
    tj.add(t2);
    return { group, fingers, thumb: { base: thumbBase, t1, t2, s } };
  }

  // grip: 0 = flat, ~0.5 = pinching a card, 1 = closed. open: 0..1 splays the fingers.
  poseHand(hand, grip, open) {
    for (const f of hand.fingers) {
      f.base.rotation.z = f.spread * 0.07 * open;
      const [a, b, c] = f.segs;
      a.rotation.x = -grip * 1.05;
      b.rotation.x = -grip * 1.35;
      c.rotation.x = -grip * 0.9;
    }
    const t = hand.thumb;
    t.base.rotation.x = -0.35 - grip * 0.6;
    t.base.rotation.z = (0.75 - grip * 0.35 + open * 0.2) * t.s;
    t.t1.rotation.x = -grip * 0.4;
    t.t2.rotation.x = -grip * 0.7;
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
    arm.gripTarget = 0.15;
    arm.rollTarget = 0;
    const from = arm.target.clone();
    await tween({ duration, update: (k) => arm.target.lerpVectors(from, arm.rest, k) });
  }

  restBoth(duration = 0.5) {
    return Promise.all([this.rest('left', duration), this.rest('right', duration)]);
  }

  // -0.3 splays the fingers open, 0 is flat, 0.5 pinches a card, 1 makes a fist.
  setGrip(side, grip) {
    this.arms[side].gripTarget = grip;
  }

  look(world) {
    this.lookTarget.copy(world);
  }

  // Idle mode lets the dealer shift weight, glance at the view and fix a cuff between hands.
  setIdle(idle) {
    if (idle === this.idle) return;
    this.idle = idle;
    this.glance = null;
    this.nextIdleBeat = 4 + Math.random() * 4;
  }

  // A small bow of the head, e.g. when announcing a result.
  async nod() {
    await tween({ duration: 0.5, easing: ease.sine, update: (k) => { this.nodAmt = Math.sin(k * Math.PI) * 0.18; } });
    this.nodAmt = 0;
  }

  // Lights the speaking bar; `seconds` is a fallback for voices that report no end event.
  talk(seconds) {
    this.talkUntil = this.time + seconds;
  }

  syllable() {
    this.talkLevel = 1;
  }

  stopTalking() {
    this.talkUntil = Math.min(this.talkUntil, this.time + 0.15);
  }

  // Open palm toward a point (the winning hand), held briefly.
  async present(side, world, hold = 1.1) {
    const arm = this.arms[side];
    arm.gripTarget = -0.25;
    arm.rollTarget = 1;
    await this.reach(side, world.clone().add(new THREE.Vector3(0, 0.1, -0.06)), 0.4, ease.out);
    await wait(hold);
    await this.rest(side, 0.45);
  }

  // ---- Idle behaviour -----------------------------------------------------

  async idleBeat() {
    const handsHome = Object.values(this.arms).every((a) => !a.follow && a.target.distanceTo(a.rest) < 0.02);
    if (!this.idle || this.busyGesture || !handsHome) return;
    this.busyGesture = true;
    if (Math.random() < 0.6) {
      // Glance out at the skyline, then back.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.glance = this.root.localToWorld(new THREE.Vector3(side * 3.5, 1.7, -2.5));
      await wait(1.4 + Math.random() * 0.8);
      this.glance = null;
    } else {
      // Straighten the left cuff with the right hand.
      const left = this.arms.left;
      const right = this.arms.right;
      const cuffAt = new THREE.Vector3(-0.02, 0.92, 0.3);
      const pinch = cuffAt.clone().add(new THREE.Vector3(0.04, 0.02, 0.03));
      await Promise.all([
        tween({ duration: 0.5, update: (k) => left.target.lerpVectors(left.rest, cuffAt, k) }),
        tween({ duration: 0.55, update: (k) => right.target.lerpVectors(right.rest, pinch, k) }),
      ]);
      right.gripTarget = 0.55;
      this.glance = this.root.localToWorld(cuffAt.clone());
      await tween({ duration: 0.7, easing: ease.sine, update: (k) => { right.target.x = pinch.x + Math.sin(k * Math.PI * 2) * 0.012; } });
      this.glance = null;
      right.gripTarget = 0.15;
      // Hands go home unless the game has already sent them somewhere else.
      if (this.idle) await this.restBoth(0.5);
    }
    this.busyGesture = false;
  }

  // ---- Per-frame update ---------------------------------------------------

  update(dt) {
    this.time += dt;
    const t = this.time;

    // Weight shift and breathing; lean toward whichever hand is reaching furthest.
    const reachZ = Math.max(this.arms.left.target.z, this.arms.right.target.z);
    const leanTarget = THREE.MathUtils.clamp((reachZ - 0.3) * 0.5, 0, 0.22);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 4);
    const shift = Math.sin(t * 0.33);
    this.hips.position.x = shift * 0.012;
    this.hips.rotation.z = shift * 0.012;
    this.hips.rotation.y = Math.sin(t * 0.21) * 0.025;
    this.torso.rotation.x = 0.05 + this.lean + Math.sin(t * 1.3) * 0.006;
    this.torso.rotation.z = -shift * 0.016;
    this.torso.scale.setScalar(1 + Math.sin(t * 1.3) * 0.004);
    this.root.updateMatrixWorld(true);

    if (this.idle) {
      this.nextIdleBeat -= dt;
      if (this.nextIdleBeat < 0) {
        this.nextIdleBeat = 7 + Math.random() * 7;
        this.idleBeat();
      }
    }

    // Head look-at with limits, smoothed (slower for idle glances).
    const target = this.glance || this.lookTarget;
    const headWorld = this.head.getWorldPosition(this.tmp.a);
    const local = this.toLocal(target).sub(this.toLocal(headWorld));
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.3, 0.7);
    const k = Math.min(1, dt * (this.glance ? 2.5 : 5));
    this.headDir.x += (yaw - this.headDir.x) * k;
    this.headDir.y += (pitch - this.headDir.y) * k;
    this.neck.rotation.y = this.headDir.x * 0.4;
    this.head.rotation.y = this.headDir.x * 0.6;
    this.head.rotation.x = this.headDir.y - this.lean * 0.6 + this.nodAmt + Math.sin(t * 0.7) * 0.01;
    this.head.rotation.z = Math.sin(t * 0.45) * 0.02 - shift * 0.01;

    // Eyes blink, and brighten a little while speaking.
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 1;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const open = 1 - Math.sin(this.blink * Math.PI);
    for (const e of this.eyes) e.scale.set(Math.max(0.15, open), 1, 1);

    // Speaking light pulses per syllable: from voice word events, or simulated when there are none.
    const talking = t < this.talkUntil;
    if (talking && t > this.nextSyllable) {
      this.talkLevel = Math.max(this.talkLevel, 0.55 + Math.random() * 0.45);
      this.nextSyllable = t + 0.09 + Math.random() * 0.11;
    }
    this.talkLevel = Math.max(0, this.talkLevel - dt * 6);
    const speak = talking ? this.talkLevel : 0;
    this.mouth.scale.set(1, 0.6 + speak * 1.2, 1);
    this.mouthMat.emissiveIntensity = 0.5 + speak * 5;
    this.eyeMat.emissiveIntensity = 3.6 + Math.sin(t * 2) * 0.3 + speak * 1.2;

    this.root.updateMatrixWorld(true);
    for (const arm of Object.values(this.arms)) this.solveArm(arm, dt);
  }

  solveArm(arm, dt) {
    const { a: S, b: E, c: W } = this.tmp;
    if (arm.follow) {
      const p = arm.follow.getWorldPosition(new THREE.Vector3()).add(arm.followOffset);
      arm.target.copy(this.toLocal(p));
    }
    arm.shoulderAnchor.getWorldPosition(S);
    S.copy(this.toLocal(S));
    const toTarget = arm.target.clone().sub(S);
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
    arm.cuff.position.copy(W).addScaledVector(foreDir, -0.012);
    arm.cuff.quaternion.setFromUnitVectors(Y_AXIS, foreDir);
    arm.wrist.position.copy(W).addScaledVector(foreDir, 0.006);
    arm.wrist.quaternion.copy(arm.cuff.quaternion);

    // Grip and palm roll ease toward their targets.
    arm.grip += (arm.gripTarget - arm.grip) * Math.min(1, dt * 10);
    arm.roll += (arm.rollTarget - arm.roll) * Math.min(1, dt * 7);

    // Hand frame: fingers continue the forearm but flatten toward the table; roll turns the palm up.
    const yAxis = foreDir.clone();
    yAxis.y = yAxis.y * 0.25 - 0.18;
    yAxis.normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(yAxis, -yAxis.y).normalize();
    const across = new THREE.Vector3().crossVectors(yAxis, up).normalize();
    const angle = arm.roll * Math.PI * -arm.s;
    const zAxis = up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(across, Math.sin(angle)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    this.tmp.m.makeBasis(xAxis, yAxis, zAxis);
    const hand = arm.hand.group;
    hand.quaternion.setFromRotationMatrix(this.tmp.m);
    hand.position.copy(W).addScaledVector(foreDir, 0.012);
    this.poseHand(arm.hand, Math.max(0, arm.grip), Math.min(1, Math.max(0, -arm.grip) * 4));

    // Cufflink on the outer side of the cuff.
    arm.link.position.copy(arm.cuff.position).addScaledVector(xAxis, 0.038 * arm.s);
    arm.link.quaternion.copy(hand.quaternion);
  }

  placeSegment(mesh, from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
    mesh.scale.set(1, len / mesh.geometry.parameters.height, 1);
  }
}
