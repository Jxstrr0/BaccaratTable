import * as THREE from 'three';
import { CARD_W, CARD_H } from './layout.js';
import { makeCardFaceTexture, makeCardBackTexture } from './textures.js';

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
    backMaterial = new THREE.MeshStandardMaterial({
      map, alphaMap: cornerMask(), alphaTest: 0.5, roughness: 0.32,
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

    this.geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);

    const faceMap = makeCardFaceTexture(card).clone();
    faceMap.needsUpdate = true;
    faceMap.anisotropy = anisotropy;
    // Seen from behind, so mirror horizontally to read correctly.
    faceMap.wrapS = THREE.RepeatWrapping;
    faceMap.repeat.x = -1;
    faceMap.offset.x = 1;
    this.faceMaterial = new THREE.MeshStandardMaterial({
      map: faceMap, alphaMap: cornerMask(), alphaTest: 0.5, roughness: 0.38,
      side: THREE.BackSide,
    });
    this.backMesh = new THREE.Mesh(this.geometry, getBackMaterial(anisotropy));
    this.faceMesh = new THREE.Mesh(this.geometry, this.faceMaterial);
    for (const m of [this.backMesh, this.faceMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }
    this.faceUp = false;
  }

  dispose() {
    this.geometry.dispose();
    this.faceMaterial.map.dispose();
    this.faceMaterial.dispose();
  }

  // Instantly show face-up / face-down (no animation).
  setFaceUp(up) {
    this.faceUp = up;
    this.pivot.rotation.set(0, 0, up ? Math.PI : 0);
    this.pivot.position.y = 0;
  }
}
