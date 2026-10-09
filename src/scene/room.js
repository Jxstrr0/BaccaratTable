import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TABLE_Y } from './layout.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const ROOM = { x0: -6, x1: 6, z0: -4.2, z1: 5, h: 3.4 };

// Procedural "city at night seen from above" for below the skyline photo's horizon.
function cityLightsTexture() {
  const W = 2048;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1622');
  grad.addColorStop(0.15, '#0d0c14');
  grad.addColorStop(1, '#030305');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Streets as faint lines converging toward the horizon, then scattered windows/lamps.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    g.strokeStyle = `rgba(255,${150 + rnd() * 60},80,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (rnd() - 0.5) * 900, H);
    g.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    const y = Math.pow(rnd(), 1.8) * H;
    const x = rnd() * W;
    const warm = rnd() > 0.25;
    const a = (1 - y / H) * (0.15 + rnd() * 0.45);
    g.fillStyle = warm ? `rgba(255,${170 + rnd() * 70},${90 + rnd() * 60},${a})` : `rgba(170,200,255,${a})`;
    const s = 0.5 + rnd() * (0.8 + (y / H) * 2);
    g.fillRect(x, y, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function abstractArtTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1400;
  const g = c.getContext('2d');
  g.fillStyle = '#121212';
  g.fillRect(0, 0, c.width, c.height);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Gold-leaf field with torn edges, then sweeping ink strokes.
  g.save();
  g.beginPath();
  g.moveTo(140, 200);
  for (let i = 0; i <= 40; i++) g.lineTo(140 + i * 18.5, 200 + Math.sin(i * 0.7) * 18 + rnd() * 14);
  for (let i = 0; i <= 40; i++) g.lineTo(880 - i * 18.5, 980 + Math.cos(i * 0.5) * 22 + rnd() * 14);
  g.closePath();
  const gold = g.createLinearGradient(140, 200, 880, 980);
  gold.addColorStop(0, '#8a6a2c');
  gold.addColorStop(0.45, '#e2c27a');
  gold.addColorStop(1, '#9b7631');
  g.fillStyle = gold;
  g.fill();
  g.clip();
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${200 + rnd() * 55},${160 + rnd() * 50},${80 + rnd() * 40},0.25)`;
    g.fillRect(140 + rnd() * 740, 200 + rnd() * 780, 30 + rnd() * 70, 30 + rnd() * 70);
  }
  g.restore();
  g.strokeStyle = 'rgba(10,10,10,0.92)';
  g.lineCap = 'round';
  for (let s = 0; s < 3; s++) {
    g.lineWidth = 60 - s * 16;
    g.beginPath();
    const y0 = 380 + s * 260;
    g.moveTo(80, y0);
    g.bezierCurveTo(400, y0 - 260 + rnd() * 100, 640, y0 + 280, 960, y0 - 80);
    g.stroke();
  }
  g.fillStyle = '#7a1b1b';
  g.beginPath();
  g.arc(700, 1150, 70, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rugTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#16120f';
  g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(176,140,74,0.5)';
  g.lineWidth = 6;
  g.strokeRect(40, 40, 944, 944);
  g.lineWidth = 2;
  g.strokeRect(64, 64, 896, 896);
  g.strokeStyle = 'rgba(176,140,74,0.12)';
  for (let i = -1024; i < 2048; i += 48) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 896, 960);
    g.moveTo(i + 896, 64);
    g.lineTo(i, 960);
    g.stroke();
  }
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(scene, lib, manager) {
  const group = new THREE.Group();
  group.name = 'room';
  const eye = new THREE.Vector3(0, 1.2, 1.1);

  // --- Skyline: the Shanghai Bund panorama strip mapped onto a sphere segment, exactly
  // matching its equirectangular projection (crop spans 180° wide, 18°–88.7° from zenith,
  // cut at the waterline so the city reads as seen from high up).
  const skyTex = new THREE.TextureLoader(manager).load(`${BASE}env/skyline.jpg`);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.repeat.x = -1;
  skyTex.offset.x = 1;
  const skyGeo = new THREE.SphereGeometry(80, 128, 48, Math.PI, Math.PI, THREE.MathUtils.degToRad(18), THREE.MathUtils.degToRad(70.74));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: new THREE.Color(0.8, 0.8, 0.85), fog: false }));
  sky.position.copy(eye);
  group.add(sky);
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(80, 128, 16, Math.PI, Math.PI, THREE.MathUtils.degToRad(88.74), THREE.MathUtils.degToRad(45)),
    new THREE.MeshBasicMaterial({ map: cityLightsTexture(), side: THREE.BackSide, fog: false }),
  );
  ground.position.copy(eye);
  group.add(ground);
  // Upper sky above the crop: deep night gradient.
  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(80.5, 64, 12, Math.PI, Math.PI, 0, THREE.MathUtils.degToRad(18.5)),
    new THREE.MeshBasicMaterial({ color: 0x1b1730, side: THREE.BackSide, fog: false }),
  );
  upper.position.copy(eye);
  group.add(upper);

  // --- Floor: polished black marble.
  const marble = lib.pbr('marble016', { repeat: [5, 5], roughness: 0.8, metalness: 0, envMapIntensity: 0.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), marble);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 3.6),
    new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 0.2);
  rug.receiveShadow = true;
  group.add(rug);

  // --- Ceiling with a recessed coffer above the table.
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ROOM.h, (ROOM.z0 + ROOM.z1) / 2);
  group.add(ceiling);
  const cove = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 1.4 });
  const covePerimeter = [[ROOM.x1 - ROOM.x0 - 0.4, 0.04, 0, ROOM.z1 - 0.2], [0.04, ROOM.z1 - ROOM.z0 - 0.4, ROOM.x0 + 0.2, 0.4], [0.04, ROOM.z1 - ROOM.z0 - 0.4, ROOM.x1 - 0.2, 0.4]];
  for (const [w, d, x, z] of covePerimeter) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), cove);
    strip.position.set(x, ROOM.h - 0.01, z);
    group.add(strip);
  }
  const coffer = new THREE.Group();
  for (const [w, d, x, z] of [[3.2, 0.03, 0, -1.2], [3.2, 0.03, 0, 1.6], [0.03, 2.8, -1.6, 0.2], [0.03, 2.8, 1.6, 0.2]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), cove);
    s.position.set(x, ROOM.h - 0.01, z);
    coffer.add(s);
  }
  group.add(coffer);

  // --- Glass curtain wall behind the dealer with black steel mullions.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fb4c8, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 0.6, depthWrite: false,
  });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.h), glass);
  pane.position.set(0, ROOM.h / 2, ROOM.z0);
  group.add(pane);
  const steel = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.8, roughness: 0.35 });
  for (let x = ROOM.x0; x <= ROOM.x1 + 0.01; x += 1.5) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, ROOM.h, 0.12), steel);
    m.position.set(x, ROOM.h / 2, ROOM.z0);
    group.add(m);
  }
  for (const y of [0.04, ROOM.h - 0.05]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, 0.1, 0.14), steel);
    t.position.set(0, y, ROOM.z0);
    group.add(t);
  }
  // Glass balustrade line outside, catching a little light.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, metalness: 1, roughness: 0.3 }));
  rail.position.set(0, 1.05, ROOM.z0 - 0.6);
  group.add(rail);

  // --- Side and back walls.
  const wood = lib.pbr('dark_wood', { repeat: [1, 3], roughness: 0.7, color: new THREE.Color(0.55, 0.48, 0.45) });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.25 });
  const sideWall = (x, rotY) => {
    const wall = new THREE.Group();
    const len = ROOM.z1 - ROOM.z0;
    const panels = 9;
    for (let i = 0; i < panels; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(len / panels - 0.02, ROOM.h, 0.05), wood);
      p.position.set(-len / 2 + (i + 0.5) * (len / panels), ROOM.h / 2, 0);
      p.receiveShadow = true;
      wall.add(p);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, ROOM.h, 0.06), brass);
      strip.position.set(-len / 2 + i * (len / panels), ROOM.h / 2, 0.005);
      wall.add(strip);
    }
    wall.rotation.y = rotY;
    wall.position.set(x, 0, (ROOM.z0 + ROOM.z1) / 2);
    group.add(wall);
    return wall;
  };
  sideWall(ROOM.x0, Math.PI / 2);
  sideWall(ROOM.x1, -Math.PI / 2);

  // Artwork on the left wall with a picture light.
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.05), new THREE.MeshStandardMaterial({ map: abstractArtTexture(), roughness: 0.6, metalness: 0.15 }));
  art.rotation.y = Math.PI / 2;
  art.position.set(ROOM.x0 + 0.06, 1.75, 0.6);
  group.add(art);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.15, 1.6), brass);
  frame.position.set(ROOM.x0 + 0.04, 1.75, 0.6);
  group.add(frame);
  const artLight = new THREE.SpotLight(0xffd6a0, 12, 4, 0.5, 0.8, 2);
  artLight.position.set(ROOM.x0 + 0.9, 3.1, 0.6);
  artLight.target.position.set(ROOM.x0, 1.7, 0.6);
  group.add(artLight, artLight.target);

  // Back wall: backlit onyx feature wall behind a bar.
  const onyx = lib.pbr('onyx013', { repeat: [2, 1], roughness: 0.2 });
  onyx.emissive = new THREE.Color(0xffb36b);
  onyx.emissiveMap = onyx.map;
  onyx.emissiveIntensity = 0.35;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.h), onyx);
  back.rotation.y = Math.PI;
  back.position.set(0, ROOM.h / 2, ROOM.z1);
  group.add(back);
  buildBar(group, wood, brass);

  // --- Lounge corner: sofa, coffee table and arc lamp, front-left.
  const velvet = lib.pbr('velour_velvet', { repeat: [3, 3], color: new THREE.Color(0.12, 0.3, 0.27), roughness: 1, physical: true, sheen: 1, sheenColor: new THREE.Color(0.25, 0.55, 0.48), sheenRoughness: 0.4 });
  const sofa = new THREE.Group();
  const seat = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.42, 0.95, 4, 0.08), velvet);
  seat.position.y = 0.21;
  const backrest = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.55, 0.22, 4, 0.08), velvet);
  backrest.position.set(0, 0.6, -0.38);
  for (const m of [seat, backrest]) { m.castShadow = m.receiveShadow = true; sofa.add(m); }
  for (const x of [-1.15, 1.15]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.6, 0.95, 4, 0.08), velvet);
    arm.position.set(x, 0.3, 0);
    arm.castShadow = true;
    sofa.add(arm);
  }
  sofa.position.set(-4.4, 0, 1.6);
  sofa.rotation.y = Math.PI / 2;
  group.add(sofa);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 64), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.05, clearcoat: 1 }));
  coffee.position.set(-3.3, 0.4, 1.6);
  coffee.castShadow = true;
  group.add(coffee);
  const coffeeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.25, 0.38, 32), brass);
  coffeeBase.position.set(-3.3, 0.19, 1.6);
  group.add(coffeeBase);
  buildArcLamp(group, brass, new THREE.Vector3(-5.2, 0, 0.1));

  // Side table by the player's seat with a whisky tumbler.
  const sideTable = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 48), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.06, clearcoat: 1 }));
  top.position.y = 0.62;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 16), brass);
  stem.position.y = 0.31;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.02, 48), brass);
  foot.position.y = 0.01;
  sideTable.add(top, stem, foot);
  sideTable.add(buildTumbler(0.633));
  sideTable.position.set(-0.85, 0, 1.25);
  sideTable.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(sideTable);

  // A tumbler on the table rail as well, by the player's left hand.
  const railGlass = buildTumbler(TABLE_Y + 0.001);
  railGlass.position.set(-0.6, 0, 0.62);
  group.add(railGlass);

  // --- Chandelier: floating brass ring over the table.
  const chandelier = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 24, 160), brass);
  ring.rotation.x = Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.012, 12, 160),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe0b0, emissiveIntensity: 6 }),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = -0.03;
  chandelier.add(ring, glow);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 8), brass);
    rod.position.set(Math.cos(a) * 0.85, 0.5, Math.sin(a) * 0.85);
    chandelier.add(rod);
  }
  chandelier.position.set(0, 2.35, -0.05);
  group.add(chandelier);

  // --- Lighting.
  const key = new THREE.SpotLight(0xffe2bf, 34, 8, 0.66, 0.7, 2);
  key.position.set(0, 3.25, 0.15);
  key.target.position.set(0, TABLE_Y, -0.05);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00008;
  key.shadow.normalBias = 0.01;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 5;
  group.add(key, key.target);

  // Gentle front light on the dealer so the figure reads against the window.
  const dealerKey = new THREE.SpotLight(0xfff0dd, 10, 6, 0.45, 0.8, 2);
  dealerKey.position.set(0.6, 2.6, 1.2);
  dealerKey.target.position.set(0, 1.35, -0.95);
  group.add(dealerKey, dealerKey.target);

  // Cool city spill from above, warm bounce from the floor.
  const fill = new THREE.HemisphereLight(0x3e3a5c, 0x1a120c, 0.55);
  group.add(fill);
  const barGlow = new THREE.PointLight(0xffb36b, 4, 7, 2);
  barGlow.position.set(0, 1.6, 4.4);
  group.add(barGlow);

  scene.add(group);
  return { group, chandelierGlow: glow, keyLight: key };
}

function buildTumbler(y) {
  const g = new THREE.Group();
  const crystal = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.006, ior: 1.52, transparent: true,
  });
  const profile = [[0, 0], [0.036, 0], [0.038, 0.004], [0.04, 0.085], [0.037, 0.085], [0.035, 0.012], [0, 0.012]].map(([r, h]) => new THREE.Vector2(r, h));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), crystal);
  const whisky = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0345, 0.0345, 0.03, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xb8651d, roughness: 0.05, transmission: 0.6, thickness: 0.03, transparent: true, opacity: 0.92 }),
  );
  whisky.position.y = 0.028;
  const ice = new THREE.Mesh(
    new RoundedBoxGeometry(0.03, 0.03, 0.03, 2, 0.005),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transmission: 1, thickness: 0.02, transparent: true }),
  );
  ice.position.y = 0.04;
  ice.rotation.set(0.3, 0.6, 0.2);
  g.add(glass, whisky, ice);
  g.position.y = y;
  return g;
}

function buildBar(group, wood, brass) {
  const bar = new THREE.Group();
  const counter = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.08, 0.7, 4, 0.03), wood);
  counter.position.set(0, 0.54, 0);
  const top = new THREE.Mesh(new RoundedBoxGeometry(4.3, 0.05, 0.8, 4, 0.02), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 }));
  top.position.set(0, 1.1, 0);
  bar.add(counter, top);
  const kick = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 2 }));
  kick.position.set(0, 0.05, -0.36);
  bar.add(kick);
  // Back shelves with bottles.
  const colors = [0x7a3b12, 0x2e4d1e, 0xd8cfb0, 0x4a1020, 0xa5671f, 0x1d2a3a, 0xc0a060];
  for (const sy of [1.45, 1.95]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.025, 0.28), brass);
    shelf.position.set(0, sy, 0.38);
    bar.add(shelf);
    for (let i = 0; i < 14; i++) {
      const h = 0.24 + Math.random() * 0.1;
      const r = 0.035 + Math.random() * 0.012;
      const profile = [[0, 0], [r, 0], [r, h * 0.62], [r * 0.4, h * 0.8], [r * 0.32, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
      const bottle = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 24),
        new THREE.MeshPhysicalMaterial({ color: colors[i % colors.length], roughness: 0.05, transmission: 0.55, thickness: 0.05, transparent: true }),
      );
      bottle.position.set(-1.65 + i * 0.25, sy + 0.013, 0.38);
      bar.add(bottle);
    }
  }
  bar.position.set(0, 0, 4.25);
  bar.rotation.y = Math.PI;
  bar.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  group.add(bar);
}

function buildArcLamp(group, brass, at) {
  const lamp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.4 }));
  base.position.y = 0.03;
  lamp.add(base);
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(0.9, 2.5, 0), new THREE.Vector3(1.4, 1.9, 0),
  );
  lamp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.012, 12, false), brass));
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
  );
  shade.position.set(1.4, 1.95, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 12), new THREE.MeshStandardMaterial({ emissive: 0xffd9a0, emissiveIntensity: 8, color: 0 }));
  bulb.position.set(1.4, 1.88, 0);
  const light = new THREE.PointLight(0xffd2a0, 2.5, 6, 2);
  light.position.set(1.4, 1.8, 0);
  lamp.add(shade, bulb, light);
  lamp.position.copy(at);
  group.add(lamp);
}
