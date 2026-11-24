import { G0 } from './constants';
import type { Vec3 } from './types';

export interface HeightfieldSim {
  readonly size: number;
  readonly upper: Float32Array;
  readonly lower: Float32Array;
  readonly velXU: Float32Array;
  readonly velZU: Float32Array;
  readonly velXL: Float32Array;
  readonly velZL: Float32Array;
  readonly mask: Uint8Array;
  totalUpper(): number;
  totalLower(): number;
}

export function createHeightfield(size = 32): HeightfieldSim {
  const n = size * size;
  const mask = new Uint8Array(n);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const nz = ((z + 0.5) / size) * 2 - 1;
      mask[z * size + x] = nx * nx + nz * nz <= 1 ? 1 : 0;
    }
  }
  const upper = new Float32Array(n);
  const lower = new Float32Array(n);
  return {
    size,
    upper,
    lower,
    velXU: new Float32Array(n),
    velZU: new Float32Array(n),
    velXL: new Float32Array(n),
    velZL: new Float32Array(n),
    mask,
    totalUpper() {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += upper[i];
      return s;
    },
    totalLower() {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += lower[i];
      return s;
    },
  };
}

export function fillUpper(hf: HeightfieldSim, _amount: number): void {
  const n = hf.size * hf.size;
  hf.upper.fill(0);
  hf.lower.fill(0);
  hf.velXU.fill(0);
  hf.velZU.fill(0);
  hf.velXL.fill(0);
  hf.velZL.fill(0);
  // 0.72 = ~72% full upper bulb - visibly full, leaves room for slosh.
  for (let i = 0; i < n; i += 1) if (hf.mask[i]) hf.upper[i] = 0.72;
}

function stepBulb(
  size: number,
  mask: Uint8Array,
  h: Float32Array,
  velX: Float32Array,
  velZ: Float32Array,
  gravity: Vec3,
  dt: number,
): void {
  const gMag = Math.sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z) || G0;
  // Horizontal slosh from projected gravity (device frame x,z).
  // Strong response so tilting is immediately visible.
  const sloshX = gravity.x * 4.5;
  const sloshZ = gravity.z * 4.5;
  const damp = Math.exp(-2.8 * dt);
  const spring = 35 * Math.max(0.3, gMag / G0);

  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = z * size + x;
      if (!mask[i]) continue;
      const hL = x > 0 && mask[i - 1] ? h[i - 1] : h[i];
      const hR = x < size - 1 && mask[i + 1] ? h[i + 1] : h[i];
      const hD = z > 0 && mask[i - size] ? h[i - size] : h[i];
      const hU = z < size - 1 && mask[i + size] ? h[i + size] : h[i];
      const gradX = (hR - hL) * 0.5;
      const gradZ = (hU - hD) * 0.5;
      velX[i] = (velX[i] + (-gradX * spring + sloshX) * dt) * damp;
      velZ[i] = (velZ[i] + (-gradZ * spring + sloshZ) * dt) * damp;
    }
  }

  const out = new Float32Array(size * size);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = z * size + x;
      if (!mask[i]) continue;
      const hv = h[i];
      if (hv <= 0) continue;
      const vx = velX[i] * dt * 5.5;
      const vz = velZ[i] * dt * 5.5;
      let moved = 0;
      const move = (ni: number, f: number) => {
        if (ni < 0 || ni >= h.length || !mask[ni] || f <= 0) return;
        const a = Math.min(hv * f, hv - moved, hv * 0.5);
        if (a <= 0) return;
        out[i] -= a;
        out[ni] += a;
        moved += a;
      };
      if (vx > 0 && x < size - 1) move(i + 1, vx);
      if (vx < 0 && x > 0) move(i - 1, -vx);
      if (vz > 0 && z < size - 1) move(i + size, vz);
      if (vz < 0 && z > 0) move(i - size, -vz);
    }
  }
  for (let i = 0; i < out.length; i += 1) h[i] = Math.max(0, h[i] + out[i]);
}

export function stepHeightfield(
  hf: HeightfieldSim,
  gravity: Vec3,
  dt: number,
  flowRate: number,
): void {
  stepBulb(hf.size, hf.mask, hf.upper, hf.velXU, hf.velZU, gravity, dt);
  stepBulb(hf.size, hf.mask, hf.lower, hf.velXL, hf.velZL, gravity, dt);

  const gMag = Math.sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z) || G0;
  const gy = gravity.y / gMag;
  const upstreamIsUpper = gy <= 0.05;
  const upstreamIsLower = gy > 0.05;
  const amount = flowRate * dt;
  if (amount <= 0) return;
  if (upstreamIsUpper) transferBulb(hf.upper, hf.lower, hf.mask, amount);
  else if (upstreamIsLower) transferBulb(hf.lower, hf.upper, hf.mask, amount);
}

function transferBulb(src: Float32Array, dst: Float32Array, mask: Uint8Array, amount: number): void {
  let total = 0;
  for (let i = 0; i < src.length; i += 1) if (mask[i]) total += src[i];
  if (total <= 0.0001) return;
  let remaining = Math.min(amount, total);
  for (let i = 0; i < src.length && remaining > 0.0001; i += 1) {
    if (!mask[i] || src[i] <= 0) continue;
    const take = Math.min(src[i], remaining * (src[i] / total) * 1.5);
    src[i] -= take;
    dst[i] += take;
    remaining -= take;
  }
}
