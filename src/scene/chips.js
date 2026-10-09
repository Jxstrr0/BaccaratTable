import * as THREE from 'three';
import { TABLE_Y } from './layout.js';
import { makeChipTextures } from './textures.js';
import { tween, ease } from '../util/tween.js';

export const DENOMS = [100, 500, 1000, 5000, 25000];
export const CHIP_R = 0.0215;
export const CHIP_T = 0.0037;

// Face and edge artwork share one atlas so each chip is a single draw call:
// the face occupies the top FACE_PX rows, the edge strip the bottom EDGE_PX rows.
const FACE_PX = 512;
const EDGE_PX = 64;
const ATLAS_H = FACE_PX + EDGE_PX;

const geometry = (() => {
  const geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_T, 40, 1);
  const uv = geo.attributes.uv;
  const edgeV = EDGE_PX / ATLAS_H;
  // Group 0 is the side wall, groups 1–2 the caps; each group owns its vertices.
  for (const group of geo.groups) {
    const side = group.materialIndex === 0;
    const seen = new Set();
    for (let i = group.start; i < group.start + group.count; i++) {
      const idx = geo.index.getX(i);
      if (seen.has(idx)) continue;
      seen.add(idx);
      const v = uv.getY(idx);
      uv.setY(idx, side ? v * edgeV : edgeV + v * (1 - edgeV));
    }
  }
  geo.clearGroups();
  return geo;
})();
const materials = new Map();

function chipMaterial(denom, anisotropy) {
  if (!materials.has(denom)) {
    const { face, edge } = makeChipTextures(denom);
    const atlas = document.createElement('canvas');
    atlas.width = FACE_PX;
    atlas.height = ATLAS_H;
    const g = atlas.getContext('2d');
    g.drawImage(face.image, 0, 0, FACE_PX, FACE_PX);
    g.drawImage(edge.image, 0, FACE_PX, FACE_PX, EDGE_PX);
    const map = new THREE.CanvasTexture(atlas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    materials.set(denom, new THREE.MeshStandardMaterial({ map, roughness: 0.4 }));
  }
  return materials.get(denom);
}

export function makeChip(denom, anisotropy = 8) {
  const mesh = new THREE.Mesh(geometry, chipMaterial(denom, anisotropy));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.userData.denom = denom;
  return mesh;
}

// Greedy breakdown of an amount into chips, largest first.
export function breakdown(amount) {
  const out = [];
  let rest = amount;
  for (let i = DENOMS.length - 1; i >= 0; i--) {
    while (rest >= DENOMS[i] && out.length < 60) {
      out.push(DENOMS[i]);
      rest -= DENOMS[i];
    }
  }
  return out;
}

// A neat stack of chips at a table position. Chips are children of the scene,
// so they can fly between stacks without reparenting maths.
export class ChipStack {
  constructor(scene, x, z, anisotropy) {
    this.scene = scene;
    this.base = new THREE.Vector3(x, TABLE_Y, z);
    this.chips = [];
    this.anisotropy = anisotropy;
  }

  get total() {
    return this.chips.reduce((s, c) => s + c.userData.denom, 0);
  }

  slot(i) {
    // Tall stacks split into neighbouring columns.
    const col = Math.floor(i / 20);
    const row = i % 20;
    const off = [[0, 0], [CHIP_R * 2.15, 0], [-CHIP_R * 2.15, 0], [0, -CHIP_R * 2.15]][col % 4];
    return new THREE.Vector3(
      this.base.x + off[0] + (Math.random() - 0.5) * 0.0012,
      this.base.y + CHIP_T / 2 + row * CHIP_T + 0.0004,
      this.base.z + off[1] + (Math.random() - 0.5) * 0.0012,
    );
  }

  topPosition() {
    return this.slot(this.chips.length);
  }

  // Adds a chip immediately at its slot.
  push(denom) {
    const chip = makeChip(denom, this.anisotropy);
    chip.position.copy(this.slot(this.chips.length));
    this.scene.add(chip);
    this.chips.push(chip);
    return chip;
  }

  // Animates a chip from a world position into the stack.
  async fly(denom, from, { duration = 0.45, arc = 0.08 } = {}) {
    const chip = makeChip(denom, this.anisotropy);
    const to = this.slot(this.chips.length);
    this.chips.push(chip);
    chip.position.copy(from);
    this.scene.add(chip);
    const start = from.clone();
    await tween({
      duration,
      easing: ease.inOut,
      update: (k) => {
        chip.position.lerpVectors(start, to, k);
        chip.position.y += Math.sin(k * Math.PI) * arc;
      },
    });
    chip.position.copy(to);
    return chip;
  }

  // Moves this whole stack (as a slide across the felt) to another position, keeping its shape.
  async slideTo(x, z, duration = 0.6) {
    const dx = x - this.base.x;
    const dz = z - this.base.z;
    const starts = this.chips.map((c) => c.position.clone());
    await tween({
      duration,
      easing: ease.inOut,
      update: (k) => this.chips.forEach((c, i) => c.position.set(starts[i].x + dx * k, starts[i].y, starts[i].z + dz * k)),
    });
    this.base.x = x;
    this.base.z = z;
  }

  popTop() {
    const chip = this.chips.pop();
    if (chip) this.scene.remove(chip);
    return chip;
  }

  clear() {
    for (const c of this.chips) this.scene.remove(c);
    this.chips = [];
  }

  // Rebuilds the stack to represent `denoms` (bottom to top) instantly.
  set(denoms) {
    this.clear();
    for (const d of denoms) this.push(d);
  }
}
