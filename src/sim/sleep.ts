import { SLEEP_DELAY, SLEEP_SPEED } from './constants';
import type { GrainBuffers } from './types';

export function updateSleep(
  grains: GrainBuffers,
  dt: number,
  gravityMagnitude: number,
): number {
  let asleep = 0;
  for (let i = 0; i < grains.count; i += 1) {
    if (grains.bulb[i] === 2) continue;
    const i3 = i * 3;
    const vx = grains.vel[i3];
    const vy = grains.vel[i3 + 1];
    const vz = grains.vel[i3 + 2];
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed < SLEEP_SPEED && gravityMagnitude > 0.5) {
      grains.sleepTimer[i] += dt;
      if (grains.sleepTimer[i] > SLEEP_DELAY) grains.asleep[i] = 1;
    } else {
      grains.sleepTimer[i] = 0;
      grains.asleep[i] = 0;
    }
    if (grains.asleep[i]) asleep += 1;
  }
  return asleep;
}
