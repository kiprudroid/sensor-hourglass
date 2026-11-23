import { createRng } from './rng';
import { createGlassProfile } from './glassProfile';
import { countBulbs, computeGrainRadius } from './grains';
import type { GrainBuffers } from './types';

/**
 * Rebuild a settled, physically plausible configuration after background resume.
 * It preserves grain conservation by only moving grains within their bulb and
 * shaping them into a cone/crater approximation aligned with gravity Y.
 */
export function rebuildSettled(
  grains: GrainBuffers,
  neckRadius: number,
  seed: number,
): void {
  const profile = createGlassProfile(neckRadius);
  const rng = createRng(seed ^ 0x9e3779b9);
  const counts = countBulbs(grains);
  const r = computeGrainRadius(profile.volume, grains.count);
  grains.radius.fill(r);

  const placeBulb = (target: number, bulb: 0 | 1, startIndex: number): number => {
    let placed = 0;
    let idx = startIndex;
    const sign = bulb === 0 ? 1 : -1;
    const baseY = sign * (profile.halfHeight * 0.22);
    const maxY = sign * (profile.halfHeight - r * 1.3);
    const minY = sign * neckRadius * 0.9;
    while (placed < target && idx < grains.count) {
      // find slot belonging to this bulb in buffer
      if (grains.bulb[idx] !== bulb) {
        idx += 1;
        continue;
      }
      const t = Math.pow(rng(), 0.65);
      const y = minY + (maxY - minY) * t;
      const cone = Math.abs(y - baseY) * 0.55;
      const profileR = Math.max(0, profile.radiusAt(y) - r * 1.1);
      const radLimit = Math.max(0, profileR - cone * 0.2);
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * radLimit;
      const i3 = idx * 3;
      grains.pos[i3] = Math.cos(ang) * rad;
      grains.pos[i3 + 1] = y;
      grains.pos[i3 + 2] = Math.sin(ang) * rad;
      grains.prev[i3] = grains.pos[i3];
      grains.prev[i3 + 1] = grains.pos[i3 + 1];
      grains.prev[i3 + 2] = grains.pos[i3 + 2];
      grains.vel[i3] = 0;
      grains.vel[i3 + 1] = 0;
      grains.vel[i3 + 2] = 0;
      grains.asleep[idx] = 1;
      grains.sleepTimer[idx] = 1;
      placed += 1;
      idx += 1;
    }
    return idx;
  };

  // Reassign bulb labels to match counts, then place.
  let cursor = 0;
  for (let i = 0; i < grains.count; i += 1) {
    if (i < counts.upper) grains.bulb[i] = 0;
    else if (i < counts.upper + counts.lower) grains.bulb[i] = 1;
    else grains.bulb[i] = 1;
  }
  cursor = placeBulb(counts.upper, 0, 0);
  placeBulb(counts.lower, 1, cursor);
}
