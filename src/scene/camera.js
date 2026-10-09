import * as THREE from 'three';
import { tween, ease } from '../util/tween.js';

export const POSES = {
  intro: { pos: new THREE.Vector3(3.2, 1.75, 4.2), target: new THREE.Vector3(0, 0.9, -0.2) },
  seat: { pos: new THREE.Vector3(0, 1.3, 1.32), target: new THREE.Vector3(0, 0.81, -0.28) },
  squeeze: { pos: new THREE.Vector3(0, 1.02, 0.76), target: new THREE.Vector3(0, 0.76, 0.445) },
};

// First-person seat camera: right-drag to look around, wheel to lean in,
// plus a slight head sway that follows the pointer.
export class SeatCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = POSES.intro.pos.clone();
    this.target = POSES.intro.target.clone();
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 0;
    this.sway = new THREE.Vector2();
    this.pointer = new THREE.Vector2();
    this.dragging = false;
    this.dragMoved = 0;
    this.locked = false;
    this.time = 0;

    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) {
        this.dragging = true;
        this.dragMoved = 0;
        this.last = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.last = { x: e.clientX, y: e.clientY };
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.0035, -1.9, 1.9);
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0035, -0.6, 0.75);
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom - e.deltaY * 0.0006, -0.15, 0.35);
    }, { passive: true });
  }

  // Did the last right-button press turn into a drag (vs a click)?
  get wasDrag() {
    return this.dragMoved > 6;
  }

  resetLook(duration = 0.6) {
    const y0 = this.yaw;
    const p0 = this.pitch;
    const z0 = this.zoom;
    return tween({ duration, update: (k) => { this.yaw = y0 * (1 - k); this.pitch = p0 * (1 - k); this.zoom = z0 * (1 - k); } });
  }

  async moveTo(name, duration = 1.0, easing = ease.inOut) {
    const pose = POSES[name];
    const p0 = this.pos.clone();
    const t0 = this.target.clone();
    this.resetLook(duration * 0.8);
    await tween({
      duration,
      easing,
      update: (k) => {
        this.pos.lerpVectors(p0, pose.pos, k);
        this.target.lerpVectors(t0, pose.target, k);
      },
    });
  }

  update(dt) {
    this.time += dt;
    // Gentle head sway toward the pointer, and a slow breathing bob.
    const k = Math.min(1, dt * 3);
    this.sway.x += (this.pointer.x * 0.04 - this.sway.x) * k;
    this.sway.y += (this.pointer.y * 0.025 - this.sway.y) * k;

    const dir = this.target.clone().sub(this.pos);
    const dist = dir.length();
    dir.normalize();
    // Apply yaw/pitch offsets around the base view direction.
    const yaw = this.yaw - this.sway.x;
    const pitch = this.pitch - this.sway.y;
    const baseYaw = Math.atan2(dir.x, -dir.z);
    const basePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const ry = baseYaw - yaw;
    const rp = THREE.MathUtils.clamp(basePitch + pitch, -1.45, 1.2);
    const look = new THREE.Vector3(Math.sin(ry) * Math.cos(rp), Math.sin(rp), -Math.cos(ry) * Math.cos(rp));

    const eye = this.pos.clone();
    eye.y += Math.sin(this.time * 1.1) * 0.0025;
    eye.addScaledVector(look, this.zoom);
    this.camera.position.copy(eye);
    this.camera.lookAt(eye.clone().addScaledVector(look, dist));
  }
}
