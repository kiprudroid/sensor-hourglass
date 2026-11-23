import { BULB_FILL_FRACTION, PACKING_FRACTION } from './constants';
import { createGlassProfile } from './glassProfile';
import { createRng } from './rng';
import type { GrainBuffers, SimCounts } from './types';

export function createGrainBuffers(capacity: number): GrainBuffers {
  return {
    capacity,
    count: 0,
    pos: new Float32Array(capacity * 3),
    prev: new Float32Array(capacity * 3),
    vel: new Float32Array(capacity * 3),
    radius: new Float32Array(capacity),
    bulb: new Uint8Array(capacity),
    sleepTimer: new Float32Array(capacity),
    asleep: new Uint8Array(capacity),
  };
}

export function grainCountForTierVolume(
  profileVolume: number,
  grainRadius: number,
): number {
  const grainVolume = (4 / 3) * Math.PI * grainRadius * grainRadius * grainRadius;
  const targetSandVolume = profileVolume * 0.5 * BULB_FILL_FRACTION;
  return Math.max(100, Math.floor((targetSandVolume * PACKING_FRACTION) / grainVolume));
}

export function computeGrainRadius(profileVolume: number, n: number): number {
  const targetSandVolume = profileVolume * 0.5 * BULB_FILL_FRACTION;
  const grainVolume = (targetSandVolume * PACKING_FRACTION) / n;
  return Math.cbrt((3 * grainVolume) / (4 * Math.PI));
}

export function fillUpperBulb(
  grains: GrainBuffers,
  neckRadius: number,
  seed: number,
  targetCount: number,
): void {
  const profile = createGlassProfile(neckRadius);
  const rng = createRng(seed);
  const r = computeGrainRadius(profile.volume, targetCount);
  const count = Math.min(targetCount, grains.capacity);
  grains.count = count;
  grains.pos.fill(0);
  grains.prev.fill(0);
  grains.vel.fill(0);
  grains.radius.fill(r);
  grains.bulb.fill(0);
  grains.sleepTimer.fill(0);
  grains.asleep.fill(0);

  // Fill bottom-up in the upper bulb using rejection sampling against the profile.
  const yMin = neckRadius * 0.8;
  const yMax = profile.halfHeight - r * 1.2;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 400;
  while (placed < count && attempts < maxAttempts) {
    attempts += 1;
    // Bias toward lower y for a settled initial pile.
    const t = Math.pow(rng(), 0.55);
    const y = yMin + t * (yMax - yMin);
    const maxR = Math.max(0, profile.radiusAt(y) - r * 1.15);
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * maxR;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const i3 = placed * 3;
    grains.pos[i3] = x;
    grains.pos[i3 + 1] = y;
    grains.pos[i3 + 2] = z;
    grains.prev[i3] = x;
    grains.prev[i3 + 1] = y;
    grains.prev[i3 + 2] = z;
    grains.bulb[placed] = 0;
    placed += 1;
  }
  grains.count = placed;
}

export function countBulbs(grains: GrainBuffers): SimCounts {
  let upper = 0;
  let lower = 0;
  let inflight = 0;
  for (let i = 0; i < grains.count; i += 1) {
    const b = grains.bulb[i];
    if (b === 0) upper += 1;
    else if (b === 1) lower += 1;
    else inflight += 1;
  }
  return { upper, lower, inflight };
}

export function resetGrainDynamics(grains: GrainBuffers): void {
  grains.vel.fill(0);
  grains.sleepTimer.fill(0);
  grains.asleep.fill(0);
  grains.prev.set(grains.pos.subarray(0, grains.count * 3));
}
