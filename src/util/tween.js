// Promise-based tweens driven by the render loop, so game flow can be written with async/await.

const active = new Set();
let speed = 1;

export function setTimeScale(s) {
  speed = s;
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// tween({ duration (s), ease, update(k, t) }) → Promise resolved when done.
export function tween({ duration = 0.5, easing = ease.inOut, update, delay = 0 }) {
  return new Promise((resolve) => {
    active.add({ t: -delay, duration: Math.max(duration, 1e-4), easing, update, resolve });
  });
}

export function wait(seconds) {
  return tween({ duration: seconds, update: () => {} });
}

export function tickTweens(dt) {
  const step = dt * speed;
  for (const tw of active) {
    tw.t += step;
    if (tw.t < 0) continue;
    const t = Math.min(tw.t / tw.duration, 1);
    tw.update(tw.easing(t), t);
    if (t >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}

export const lerp = (a, b, k) => a + (b - a) * k;
