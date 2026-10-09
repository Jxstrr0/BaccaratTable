import * as THREE from 'three';
import {
  TABLE_Y, DEALER_EDGE, OUTER, FELT, FELT_BOUNDS, ARC_CENTER, ZONES, CARD_SPOTS, CARD_W, CARD_H,
  SHOE_POS, DISCARD_POS, FLOAT_POS, polarToXZ,
} from './layout.js';
import { makeFeltNormalTexture, makeFeltNoiseTexture, makeCardBackTexture } from './textures.js';

const GOLD = '#c9a24a';
const FELT_COLOR = '#08382a';

// Points on an outline made of the dealer edge plus an elliptical arc toward the player.
function outlinePoints({ a, b, edge }, segments = 160) {
  const pts = [];
  const s0 = Math.asin(Math.min(1, Math.max(-1, (edge - DEALER_EDGE) / b)));
  for (let i = 0; i <= segments; i++) {
    const t = s0 + (Math.PI - 2 * s0) * (i / segments);
    pts.push(new THREE.Vector2(a * Math.cos(t), DEALER_EDGE + b * Math.sin(t)));
  }
  return pts; // (x, z) pairs, open: the closing segment is the straight dealer edge
}

function shapeFrom(points) {
  // Shape space y = -z so that rotating -90° about X lands it on the table plane.
  return new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
}

function flatShapeGeometry(points, y) {
  const geo = new THREE.ShapeGeometry(shapeFrom(points), 64);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const { x0, x1, z0, z1 } = FELT_BOUNDS;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), 1 - (pos.getZ(i) - z0) / (z1 - z0));
  }
  return geo;
}

function extrudedSlab(points, yBottom, yTop, bevel = 0.006) {
  const geo = new THREE.ExtrudeGeometry(shapeFrom(points), {
    depth: yTop - yBottom - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 64,
  });
  // Extrusion runs along +z in shape space; stand it up so it runs along +y.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yBottom + bevel, 0);
  return geo;
}

// ---------------------------------------------------------------------------
// Felt artwork

function paintFelt() {
  const { x0, x1, z0, z1 } = FELT_BOUNDS;
  const W = 4096;
  const H = Math.round((W * (z1 - z0)) / (x1 - x0));
  const ppm = W / (x1 - x0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const px = (x) => (x - x0) * ppm;
  const pz = (z) => (z - z0) * ppm;

  // Base cloth with a soft pool of light toward the centre.
  g.fillStyle = FELT_COLOR;
  g.fillRect(0, 0, W, H);
  const pool = g.createRadialGradient(px(0), pz(0.05), 50, px(0), pz(0.05), W * 0.6);
  pool.addColorStop(0, 'rgba(40,120,90,0.35)');
  pool.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = pool;
  g.fillRect(0, 0, W, H);

  const serif = (size, weight = '600') => `${weight} ${size}px "Cormorant Garamond", Didot, "Bodoni 72", Georgia, "Times New Roman", serif`;
  const sans = (size, weight = '500') => `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  const cx = px(ARC_CENTER.x);
  const cz = pz(ARC_CENTER.z);

  // Canvas angle for a layout angle (0 = straight toward the dealer).
  const canvasAngle = (a) => -Math.PI / 2 + a;

  function arcBand(zone, inset = 0) {
    const r0 = (zone.r0 + inset) * ppm;
    const r1 = (zone.r1 - inset) * ppm;
    const a0 = canvasAngle(zone.a0 + inset / ((zone.r0 + zone.r1) / 2));
    const a1 = canvasAngle(zone.a1 - inset / ((zone.r0 + zone.r1) / 2));
    g.beginPath();
    g.arc(cx, cz, r1, a0, a1);
    g.arc(cx, cz, r0, a1, a0, true);
    g.closePath();
  }

  function arcText(text, r, aMid, font, color, spacing = 0.12) {
    g.save();
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const widths = [...text].map((ch) => g.measureText(ch).width);
    const total = widths.reduce((s, w) => s + w, 0) * (1 + spacing);
    let angle = canvasAngle(aMid) - total / 2 / (r * ppm);
    [...text].forEach((ch, i) => {
      const w = widths[i] * (1 + spacing);
      angle += w / 2 / (r * ppm);
      g.save();
      g.translate(cx + Math.cos(angle) * r * ppm, cz + Math.sin(angle) * r * ppm);
      g.rotate(angle + Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
      angle += w / 2 / (r * ppm);
    });
    g.restore();
  }

  for (const zone of ZONES) {
    const main = zone.key === 'player' || zone.key === 'banker';
    // Tinted fill and double gold rule.
    arcBand(zone, 0.004);
    g.fillStyle = zone.key === 'tie' ? 'rgba(20,90,60,0.35)' : 'rgba(0,0,0,0.12)';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = GOLD;
    g.stroke();
    arcBand(zone, 0.014);
    g.lineWidth = 3;
    g.strokeStyle = main ? zone.color : 'rgba(201,162,74,0.55)';
    g.stroke();

    const mid = (zone.a0 + zone.a1) / 2;
    const rMid = (zone.r0 + zone.r1) / 2;
    const big = main ? 112 : zone.key === 'tie' ? 96 : 66;
    arcText(zone.label, rMid + (main ? 0.02 : 0.015), mid, serif(big, '600'), main ? '#e9cf8a' : GOLD, main ? 0.35 : 0.2);
    arcText(zone.sub, rMid - (main ? 0.055 : 0.04), mid, sans(main ? 34 : 28, '500'), 'rgba(233,207,138,0.75)', 0.4);
  }

  // Card boxes.
  function cardBox(spot) {
    const w = (spot.rot ? CARD_H : CARD_W) * ppm + 26;
    const h = (spot.rot ? CARD_W : CARD_H) * ppm + 26;
    const x = px(spot.x) - w / 2;
    const y = pz(spot.z) - h / 2;
    g.beginPath();
    g.roundRect(x, y, w, h, 18);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(201,162,74,0.6)';
    g.setLineDash(spot.rot ? [16, 12] : []);
    g.stroke();
    g.setLineDash([]);
  }
  [...CARD_SPOTS.player, ...CARD_SPOTS.banker].forEach((s) => cardBox(s));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '18px';
  g.font = serif(70, '600');
  g.fillStyle = '#e9cf8a';
  g.fillText('PLAYER', px(-0.37), pz(-0.155));
  g.fillText('BANKER', px(0.37), pz(-0.155));
  g.letterSpacing = '0px';

  // Centre medallion and wordmark.
  const mx = px(0);
  const mz = pz(0.05);
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(mx, mz, 70, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(mx, mz, 82, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(mx + Math.cos(a) * 90, mz + Math.sin(a) * 90);
    g.lineTo(mx + Math.cos(a) * (i % 2 ? 104 : 118), mz + Math.sin(a) * (i % 2 ? 104 : 118));
    g.stroke();
  }
  g.font = serif(96, '600');
  g.fillStyle = '#e9cf8a';
  g.fillText('P', mx, mz + 6);

  g.letterSpacing = '22px';
  g.font = serif(54, '500');
  g.fillStyle = 'rgba(233,207,138,0.85)';
  g.fillText('PENTHOUSE', mx, mz - 240);
  g.letterSpacing = '10px';
  g.font = sans(24, '500');
  g.fillStyle = 'rgba(233,207,138,0.6)';
  g.fillText('PRIVATE SALON  ·  PUNTO BANCO', mx, mz - 180);
  g.letterSpacing = '6px';
  g.font = sans(22, '500');
  g.fillText('TABLE LIMITS  100 — 100,000', px(0), pz(-0.52));
  g.fillText('BANKER COMMISSION 5%', px(-0.42), pz(-0.52));
  g.fillText('EIGHT DECK SHOE', px(0.42), pz(-0.52));
  g.letterSpacing = '0px';

  // Fine border just inside the rail.
  g.strokeStyle = 'rgba(201,162,74,0.45)';
  g.lineWidth = 4;
  g.beginPath();
  const inner = outlinePoints({ a: FELT.a - 0.03, b: FELT.b - 0.03, edge: FELT.edge + 0.025 });
  inner.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.y)) : g.moveTo(px(p.x), pz(p.y))));
  g.closePath();
  g.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------

export function buildTable(lib, anisotropy) {
  const group = new THREE.Group();
  group.name = 'table';

  const outer = outlinePoints({ a: OUTER.a, b: OUTER.b, edge: DEALER_EDGE });
  const feltPts = outlinePoints(FELT);

  // Felt
  const feltMap = paintFelt();
  feltMap.anisotropy = anisotropy;
  const feltNormal = makeFeltNormalTexture();
  feltNormal.repeat.set(60, 35);
  const feltRough = makeFeltNoiseTexture();
  feltRough.repeat.set(40, 24);
  const feltMat = new THREE.MeshPhysicalMaterial({
    map: feltMap,
    normalMap: feltNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: feltRough,
    roughness: 1,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0x1a5a44),
  });
  const felt = new THREE.Mesh(flatShapeGeometry(feltPts, TABLE_Y), feltMat);
  felt.receiveShadow = true;
  felt.name = 'felt';
  group.add(felt);

  // Lacquered walnut top and apron.
  const wood = lib.pbr('dark_wood', {
    physical: true, repeat: [2, 2], clearcoat: 1, clearcoatRoughness: 0.08, roughness: 0.55,
    color: new THREE.Color(0.85, 0.75, 0.7),
  });
  const slab = new THREE.Mesh(extrudedSlab(outer, TABLE_Y - 0.05, TABLE_Y - 0.001), wood);
  slab.castShadow = slab.receiveShadow = true;
  group.add(slab);

  const apronPts = outlinePoints({ a: OUTER.a - 0.06, b: OUTER.b - 0.06, edge: DEALER_EDGE + 0.04 });
  const apron = new THREE.Mesh(extrudedSlab(apronPts, TABLE_Y - 0.19, TABLE_Y - 0.05, 0.01), wood);
  apron.castShadow = apron.receiveShadow = true;
  group.add(apron);

  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a85e, metalness: 1, roughness: 0.22 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: 0x8a6a35, metalness: 1, roughness: 0.35 });

  // Brass inlay line around the slab edge.
  const inlayCurve = new THREE.CatmullRomCurve3(
    outlinePoints({ a: OUTER.a + 0.004, b: OUTER.b + 0.004, edge: DEALER_EDGE - 0.004 }, 120)
      .map((p) => new THREE.Vector3(p.x, TABLE_Y - 0.03, p.y)),
    true,
  );
  group.add(new THREE.Mesh(new THREE.TubeGeometry(inlayCurve, 400, 0.004, 8, true), brass));

  // Padded leather rail along the player's arc.
  const leather = lib.pbr('brown_leather', {
    repeat: [8, 1], color: new THREE.Color(0.34, 0.26, 0.22), roughness: 0.85,
  });
  const railPts = outlinePoints({ a: (OUTER.a + FELT.a) / 2 + 0.005, b: (OUTER.b + FELT.b) / 2 + 0.005, edge: DEALER_EDGE }, 120)
    .slice(6, -6)
    .map((p) => new THREE.Vector3(p.x, TABLE_Y + 0.012, p.y));
  const railCurve = new THREE.CatmullRomCurve3(railPts);
  const railGeo = new THREE.TubeGeometry(railCurve, 300, 0.052, 24, false);
  railGeo.computeBoundingBox();
  // Flatten into a cushioned profile.
  const rp = railGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setY(i, TABLE_Y + 0.012 + (rp.getY(i) - TABLE_Y - 0.012) * 0.62);
  railGeo.computeVertexNormals();
  const rail = new THREE.Mesh(railGeo, leather);
  rail.castShadow = rail.receiveShadow = true;
  group.add(rail);
  for (const end of [railPts[0], railPts[railPts.length - 1]]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 24, 16), leather);
    cap.scale.y = 0.62;
    cap.position.copy(end);
    group.add(cap);
  }

  // Pedestal base.
  const pedestalProfile = [
    [0.0, 0], [0.42, 0], [0.44, 0.012], [0.42, 0.03], [0.2, 0.06], [0.13, 0.12], [0.12, 0.5], [0.16, 0.55], [0.24, 0.56], [0, 0.56],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pedestalGeo = new THREE.LatheGeometry(pedestalProfile, 64);
  for (const x of [-0.55, 0.55]) {
    const ped = new THREE.Mesh(pedestalGeo, wood);
    ped.position.set(x, 0, 0.1);
    ped.scale.set(1, 1, 0.8);
    ped.castShadow = ped.receiveShadow = true;
    group.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.008, 12, 96), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.014, 0.1);
    ring.scale.set(1, 0.8, 1);
    group.add(ring);
  }

  // Dealer's chip float: recessed tray with brass rim.
  const tray = new THREE.Group();
  const trayW = 0.74;
  const trayD = 0.11;
  const trayBase = new THREE.Mesh(new THREE.BoxGeometry(trayW, 0.004, trayD), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 }));
  trayBase.position.y = TABLE_Y + 0.002;
  tray.add(trayBase);
  const rimMat = brass;
  for (const [w, d, x, z] of [[trayW, 0.006, 0, -trayD / 2], [trayW, 0.006, 0, trayD / 2], [0.006, trayD, -trayW / 2, 0], [0.006, trayD, trayW / 2, 0]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.016, d), rimMat);
    r.position.set(x, TABLE_Y + 0.008, z);
    tray.add(r);
  }
  for (let i = 1; i < 6; i++) {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, trayD - 0.01), darkBrass);
    div.position.set(-trayW / 2 + (trayW / 6) * i, TABLE_Y + 0.006, 0);
    tray.add(div);
  }
  tray.position.set(FLOAT_POS.x, 0, FLOAT_POS.z);
  group.add(tray);

  // Dealing shoe: black acrylic wedge with brass faceplate, facing the dealer's right hand.
  const shoe = buildShoe(brass);
  shoe.position.set(SHOE_POS.x, TABLE_Y, SHOE_POS.z);
  shoe.rotation.y = -0.5;
  group.add(shoe);

  // Discard holder: clear acrylic box.
  const discard = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.02, 0.06, CARD_H + 0.02), glass);
  box.position.y = TABLE_Y + 0.03;
  discard.add(box);
  discard.position.set(DISCARD_POS.x, 0, DISCARD_POS.z);
  discard.rotation.y = 0.35;
  group.add(discard);
  const discardStack = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_W, 1, CARD_H),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 }),
  );
  discardStack.scale.y = 0.0001;
  discardStack.position.y = TABLE_Y;
  discard.add(discardStack);

  // Highlight overlays for each betting zone (hover and win glow).
  const highlights = {};
  for (const zone of ZONES) {
    const geo = new THREE.RingGeometry(zone.r0, zone.r1, 48, 1, Math.PI / 2 - zone.a1, zone.a1 - zone.a0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ARC_CENTER.x, TABLE_Y + 0.0015, ARC_CENTER.z);
    mesh.renderOrder = 2;
    group.add(mesh);
    highlights[zone.key] = { mesh, hover: 0, glow: 0 };
  }

  return { group, felt, shoe, discard, discardStack, highlights };
}

function buildShoe(brass) {
  const g = new THREE.Group();
  const len = 0.36;
  const w = CARD_W + 0.03;
  // Side profile: low at the front (toward the dealer, -z local), tall at the back.
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  profile.lineTo(len, 0);
  profile.lineTo(len, 0.11);
  profile.lineTo(0.05, 0.075);
  profile.lineTo(0, 0.03);
  profile.closePath();
  const geo = new THREE.ExtrudeGeometry(profile, { depth: w, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 });
  geo.translate(-len / 2, 0, -w / 2);
  geo.rotateY(Math.PI / 2); // length runs along z
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const body = new THREE.Mesh(geo, acrylic);
  body.castShadow = true;
  g.add(body);
  // Cards visible through the sloped top: a block of card edges.
  const stack = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_W, 0.07, len * 0.75),
    new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.9 }),
  );
  stack.position.set(0, 0.06, 0.02);
  g.add(stack);
  // Top card back peeking out at the mouth.
  const back = makeCardBackTexture();
  const mouthCard = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshStandardMaterial({ map: back, roughness: 0.5 }));
  mouthCard.rotation.x = -Math.PI / 2 - 0.62;
  mouthCard.rotation.z = Math.PI;
  mouthCard.position.set(0, 0.058, -len / 2 + 0.085);
  g.add(mouthCard);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 0.012, 0.03, 0.008), brass);
  plate.position.set(0, 0.016, -len / 2 - 0.004);
  g.add(plate);
  // The dealer draws from the mouth: expose it in table-group coordinates.
  g.userData.mouth = new THREE.Vector3(0, 0.045, -len / 2 - 0.02);
  return g;
}

export { polarToXZ };
