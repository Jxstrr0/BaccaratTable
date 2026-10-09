import * as THREE from 'three';
import { CARD_W, CARD_H } from './layout.js';
import { makeCardFaceTexture, makeCardBackTexture } from './textures.js';

const SEG_X = 22;
const SEG_Y = 30;

let backMaterial = null;
let alphaMask = null;

// Rounded-corner mask shared by every card (used as alphaMap with alphaTest).
function cornerMask() {
  if (alphaMask) return alphaMask;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * CARD_H) / CARD_W);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(1, 1, c.width - 2, c.height - 2, 15);
  g.fill();
  alphaMask = new THREE.CanvasTexture(c);
  return alphaMask;
}

function getBackMaterial(anisotropy) {
  if (!backMaterial) {
    const map = makeCardBackTexture();
    map.anisotropy = anisotropy;
    backMaterial = new THREE.MeshPhysicalMaterial({
      map, alphaMap: cornerMask(), alphaTest: 0.5, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.35,
      side: THREE.FrontSide,
    });
  }
  return backMaterial;
}

// A single playing card. Local frame: x across the width, y along the length, +z out of the back.
// The face is printed on the -z side. The card lies on the table when rotated -90° about X.
export class Card3D {
  constructor(card, anisotropy = 8) {
    this.card = card;
    this.root = new THREE.Group(); // positioned on the table
    this.pivot = new THREE.Group(); // flips and lifts
    this.root.add(this.pivot);
    this.body = new THREE.Group();
    this.body.rotation.x = -Math.PI / 2;
    this.pivot.add(this.body);

    this.geometry = new THREE.PlaneGeometry(CARD_W, CARD_H, SEG_X, SEG_Y);
    this.rest = Float32Array.from(this.geometry.attributes.position.array);

    const faceMap = makeCardFaceTexture(card).clone();
    faceMap.needsUpdate = true;
    faceMap.anisotropy = anisotropy;
    // Seen from behind, so mirror horizontally to read correctly.
    faceMap.wrapS = THREE.RepeatWrapping;
    faceMap.repeat.x = -1;
    faceMap.offset.x = 1;
    this.faceMaterial = new THREE.MeshPhysicalMaterial({
      map: faceMap, alphaMap: cornerMask(), alphaTest: 0.5, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4,
      side: THREE.BackSide,
    });
    this.backMesh = new THREE.Mesh(this.geometry, getBackMaterial(anisotropy));
    this.faceMesh = new THREE.Mesh(this.geometry, this.faceMaterial);
    for (const m of [this.backMesh, this.faceMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.card = this;
      this.body.add(m);
    }
    // Paper thickness: a hairline edge so stacked or lifted cards don't look paper-thin.
    this.faceUp = false;
    this.curl = { amount: 0, dir: new THREE.Vector2(0, 1) };
  }

  dispose() {
    this.geometry.dispose();
    this.faceMaterial.map.dispose();
    this.faceMaterial.dispose();
  }

  // Bend the card as if lifted from an edge.
  // dir: unit vector in card space pointing from the lifted edge toward the card's interior.
  // amount: distance (m) the fold line has travelled in from that edge.
  setCurl(amount, dir = this.curl.dir) {
    this.curl.amount = amount;
    this.curl.dir.copy(dir).normalize();
    const pos = this.geometry.attributes.position;
    const rest = this.rest;
    if (amount <= 1e-5) {
      pos.array.set(rest);
      pos.needsUpdate = true;
      this.geometry.computeVertexNormals();
      return;
    }
    const u = this.curl.dir;
    // s measured from the lifted edge (the most negative projection among corners).
    const hw = CARD_W / 2;
    const hh = CARD_H / 2;
    const sMin = Math.min(...[[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].map(([x, y]) => x * u.x + y * u.y));
    const R = 0.016;
    const fold = amount * 0.55;
    // The lifted flap tilts further up the further it is pulled.
    const phi = Math.min(Math.PI * 0.72, 0.35 + amount * 16);
    const arcLen = R * phi;
    const sE = fold - R * Math.sin(phi);
    const zE = R * (1 - Math.cos(phi));
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const s = x * u.x + y * u.y - sMin;
      const d = fold - s;
      let s2 = s;
      let z = 0;
      if (d > 0) {
        if (d <= arcLen) {
          const th = d / R;
          s2 = fold - R * Math.sin(th);
          z = R * (1 - Math.cos(th));
        } else {
          const t = d - arcLen;
          s2 = sE - t * Math.cos(phi);
          z = zE + t * Math.sin(phi);
        }
      }
      const shift = s2 - s;
      pos.setXYZ(i, x + u.x * shift, y + u.y * shift, z);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  // Instantly show face-up / face-down (no animation).
  setFaceUp(up) {
    this.faceUp = up;
    this.pivot.rotation.set(0, 0, up ? Math.PI : 0);
    this.pivot.position.y = 0;
  }

  get object() {
    return this.root;
  }
}
