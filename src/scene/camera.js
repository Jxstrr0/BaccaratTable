import * as THREE from 'three';
import { tween, ease } from '../util/tween.js';

export const POSES = {
  intro: { pos: new THREE.Vector3(3.2, 1.75, 4.2), target: new THREE.Vector3(0, 0.9, -0.2) },
  seat: { pos: new THREE.Vector3(0, 1.3, 1.32), target: new THREE.Vector3(0, 0.81, -0.28) },
};

const TOUCH_SLOP = 8; // px a finger may wander before a tap becomes a drag

// First-person seat camera. Mouse: right-drag to look around, wheel to lean in, and a slight
// head sway that follows the pointer. Touch: one-finger drag to look, pinch to lean in.
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
    this.time = 0;

    // Touch state.
    this.touches = new Map();
    this.touchLook = null;
    this.pinchDist = 0;
    this.multiTouch = false;

    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touchDown(e);
        return;
      }
      if (e.button === 2 || e.button === 1) {
        this.dragging = true;
        this.dragMoved = 0;
        this.last = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        this.touchMove(e);
        return;
      }
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.last = { x: e.clientX, y: e.clientY };
      this.look(dx, dy, 0.0035);
    });
    const up = (e) => {
      if (e.pointerType === 'touch') this.touchUp(e);
      else this.dragging = false;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom - e.deltaY * 0.0006, -0.15, 0.35);
    }, { passive: true });
  }

  look(dx, dy, sensitivity) {
    this.yaw = THREE.MathUtils.clamp(this.yaw - dx * sensitivity, -1.9, 1.9);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -0.6, 0.75);
  }

  touchDown(e) {
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 1) {
      this.multiTouch = false;
      this.touchLook = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    } else if (this.touches.size === 2) {
      // Second finger: switch to pinch and stop looking.
      this.multiTouch = true;
      this.touchLook = null;
      this.dragging = false;
      this.pinchDist = this.touchSpread();
    }
  }

  touchMove(e) {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size >= 2) {
      const d = this.touchSpread();
      this.zoom = THREE.MathUtils.clamp(this.zoom + (d - this.pinchDist) * 0.0012, -0.15, 0.35);
      this.pinchDist = d;
      return;
    }
    const t = this.touchLook;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    t.moved += Math.abs(dx) + Math.abs(dy);
    if (t.moved < TOUCH_SLOP) return;
    this.dragging = true;
    this.look(dx, dy, 0.005);
  }

  touchUp(e) {
    this.touches.delete(e.pointerId);
    if (this.touchLook?.id === e.pointerId) this.touchLook = null;
    if (!this.touches.size) this.dragging = false;
  }

  touchSpread() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
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
