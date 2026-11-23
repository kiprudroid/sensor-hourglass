import { G0 } from '../sim/constants';
import type { Vec3 } from '../sim/types';

export interface VirtualOrientation {
  /** Current virtual gravity, device frame. */
  readonly gravity: Vec3;
  /** Set from drag: x/y in [-1,1]. */
  setTilt(x: number, y: number): void;
  /** Animate 180° flip over ~1.2s. */
  triggerFlip(): void;
  /** Short shake impulse train. */
  triggerShake(): void;
  update(dt: number): Vec3;
  reset(): void;
}

export function createVirtualOrientation(): VirtualOrientation {
  const gravity: Vec3 = { x: 0, y: -G0, z: 0 };
  let tiltX = 0;
  let tiltY = -1;
  let flipT = -1;
  let flipFrom = -1;
  let shakeT = -1;

  return {
    gravity,
    setTilt(x, y) {
      tiltX = Math.max(-1, Math.min(1, x));
      tiltY = Math.max(-1, Math.min(1, y));
    },
    triggerFlip() {
      flipFrom = tiltY;
      flipT = 0;
    },
    triggerShake() {
      shakeT = 0;
    },
    update(dt) {
      if (flipT >= 0) {
        flipT += dt;
        const p = Math.min(1, flipT / 1.2);
        // spring-ish ease
        const e = 1 - Math.pow(1 - p, 3);
        tiltY = flipFrom + (-flipFrom - flipFrom) * e;
        if (p >= 1) flipT = -1;
      }
      let sx = 0;
      let sy = 0;
      if (shakeT >= 0) {
        shakeT += dt;
        const amp = Math.max(0, 1 - shakeT / 0.6) * 1.5 * G0;
        sx = Math.sin(shakeT * 55) * amp;
        sy = Math.cos(shakeT * 42) * amp * 0.5;
        if (shakeT > 0.6) shakeT = -1;
      }
      const baseX = tiltX * G0;
      const baseY = tiltY * G0;
      const baseZ =
        -Math.sqrt(Math.max(0, G0 * G0 - baseX * baseX - baseY * baseY)) * 0.15;
      gravity.x = baseX + sx;
      gravity.y = baseY + sy;
      gravity.z = baseZ;
      return gravity;
    },
    reset() {
      tiltX = 0;
      tiltY = -1;
      flipT = -1;
      shakeT = -1;
      gravity.x = 0;
      gravity.y = -G0;
      gravity.z = 0;
    },
  };
}
