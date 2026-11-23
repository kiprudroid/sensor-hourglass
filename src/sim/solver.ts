import {
  G0,
  GRAIN_GLASS_FRICTION,
  GRAIN_GRAIN_FRICTION,
  MAX_GRAIN_SPEED,
  RESTITUTION,
  ROLLING_RESISTANCE,
  SLEEP_DELAY,
  SLEEP_SPEED,
  SOLVER_ITERATIONS,
} from './constants';
import { createGlassProfile, type GlassProfile } from './glassProfile';
import { createSpatialHash } from './hash';
import type { EventBuffer, GrainBuffers, SimMetrics, Vec3 } from './types';

export interface Solver {
  step(
    grains: GrainBuffers,
    gravity: Vec3,
    dt: number,
    substeps: number,
    iterations?: number,
  ): SimMetrics;
  readonly profile: GlassProfile;
  readonly events: EventBuffer;
  setNeckRadius(r: number): void;
}

function createEvents(capacity: number): EventBuffer {
  return {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    strength: new Float32Array(capacity),
    head: 0,
    size: 0,
    capacity,
  };
}

// pushEvent reserved for impact/splash events.

function clampSpeed(v: Float32Array, i3: number, max: number): void {
  const x = v[i3];
  const y = v[i3 + 1];
  const z = v[i3 + 2];
  const m2 = x * x + y * y + z * z;
  const max2 = max * max;
  if (m2 > max2) {
    const inv = max / Math.sqrt(m2);
    v[i3] = x * inv;
    v[i3 + 1] = y * inv;
    v[i3 + 2] = z * inv;
  }
}

export function createSolver(neckRadius: number, capacity: number): Solver {
  let profile = createGlassProfile(neckRadius);
  const hash = createSpatialHash(capacity, neckRadius * 1.8);
  const events = createEvents(64);
  const metrics: SimMetrics = {
    stepMs: 0,
    settledFraction: 0,
    agitation: 0,
    flowGrainsPerSecond: 0,
    gravityMagnitude: G0,
    gn: G0,
  };

  const collideGlass = (grains: GrainBuffers, i: number): void => {
    const i3 = i * 3;
    const x = grains.pos[i3];
    const y = grains.pos[i3 + 1];
    const z = grains.pos[i3 + 2];
    const r = grains.radius[i];
    const rad = Math.sqrt(x * x + z * z);
    const limit = Math.max(0.0005, profile.radiusAt(y) - r);
    if (rad > limit) {
      const inv = limit / (rad || 1e-6);
      const nx = (x * inv - x) * 0.98;
      const nz = (z * inv - z) * 0.98;
      grains.pos[i3] = x + nx;
      grains.pos[i3 + 2] = z + nz;
      // Tangential friction against glass.
      const vx = grains.vel[i3];
      const vz = grains.vel[i3 + 2];
      const nLen = Math.sqrt(nx * nx + nz * nz) || 1;
      const unx = nx / nLen;
      const unz = nz / nLen;
      const vn = vx * unx + vz * unz;
      grains.vel[i3] -= vn * unx * (1 + RESTITUTION);
      grains.vel[i3 + 2] -= vn * unz * (1 + RESTITUTION);
      grains.vel[i3] *= 1 - GRAIN_GLASS_FRICTION * 0.12;
      grains.vel[i3 + 2] *= 1 - GRAIN_GLASS_FRICTION * 0.12;
    }
    const cap = profile.halfHeight - r;
    if (y > cap) {
      grains.pos[i3 + 1] = cap;
      grains.vel[i3 + 1] *= -RESTITUTION;
    } else if (y < -cap) {
      grains.pos[i3 + 1] = -cap;
      grains.vel[i3 + 1] *= -RESTITUTION;
    }
  };

  return {
    profile,
    events,
    setNeckRadius(r: number) {
      profile = createGlassProfile(r);
      (this as { profile: GlassProfile }).profile = profile;
      hash.cellSize = Math.max(r * 1.5, 0.0025);
    },
    step(
      grains: GrainBuffers,
      gravity: Vec3,
      dt: number,
      substeps: number,
      iterations = SOLVER_ITERATIONS,
    ): SimMetrics {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const h = dt / Math.max(1, substeps);
      const gMag = Math.sqrt(
        gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z,
      );
      metrics.gravityMagnitude = gMag;
      metrics.gn = Math.abs(gravity.y);

      for (let s = 0; s < substeps; s += 1) {
        // Integrate.
        for (let i = 0; i < grains.count; i += 1) {
          if (grains.bulb[i] === 2) continue;
          const i3 = i * 3;
          if (grains.asleep[i]) {
            // Wake if gravity changed substantially relative to support - simple: wake on shake.
            if (gMag < 0.5 || metrics.agitation > 0.15) grains.asleep[i] = 0;
            else continue;
          }
          grains.vel[i3] += gravity.x * h;
          grains.vel[i3 + 1] += gravity.y * h;
          grains.vel[i3 + 2] += gravity.z * h;
          // Damping/rolling resistance.
          const damp = 1 - ROLLING_RESISTANCE * h;
          grains.vel[i3] *= damp;
          grains.vel[i3 + 1] *= damp;
          grains.vel[i3 + 2] *= damp;
          clampSpeed(grains.vel, i3, MAX_GRAIN_SPEED);
          grains.prev[i3] = grains.pos[i3];
          grains.prev[i3 + 1] = grains.pos[i3 + 1];
          grains.prev[i3 + 2] = grains.pos[i3 + 2];
          grains.pos[i3] += grains.vel[i3] * h;
          grains.pos[i3 + 1] += grains.vel[i3 + 1] * h;
          grains.pos[i3 + 2] += grains.vel[i3 + 2] * h;
        }

        // Spatial hash rebuild.
        hash.clear();
        for (let i = 0; i < grains.count; i += 1) {
          if (grains.bulb[i] === 2) continue;
          const i3 = i * 3;
          hash.insert(i, grains.pos[i3], grains.pos[i3 + 1], grains.pos[i3 + 2]);
        }

        // Constraints / contacts.
        const { head, next, tableSize } = hash;
        const cs = hash.cellSize;
        for (let iter = 0; iter < iterations; iter += 1) {
          for (let i = 0; i < grains.count; i += 1) {
            if (grains.bulb[i] === 2 || grains.asleep[i]) continue;
            const i3 = i * 3;
            const xi = grains.pos[i3];
            const yi = grains.pos[i3 + 1];
            const zi = grains.pos[i3 + 2];
            const ri = grains.radius[i];
            const baseX = Math.floor(xi / cs);
            const baseY = Math.floor(yi / cs);
            const baseZ = Math.floor(zi / cs);
            for (let dzc = -1; dzc <= 1; dzc += 1) {
              for (let dyc = -1; dyc <= 1; dyc += 1) {
                for (let dxc = -1; dxc <= 1; dxc += 1) {
                  let hIdx =
                    ((baseX + dxc) * 73856093) ^
                    ((baseY + dyc) * 19349663) ^
                    ((baseZ + dzc) * 83492791);
                  hIdx &= tableSize - 1;
                  if (hIdx < 0) hIdx += tableSize;
                  for (let j = head[hIdx]; j !== -1; j = next[j]) {
                    if (j <= i || grains.bulb[j] === 2) continue;
                    const j3 = j * 3;
                    let dx = xi - grains.pos[j3];
                    let dy = yi - grains.pos[j3 + 1];
                    let dz = zi - grains.pos[j3 + 2];
                    const minD = ri + grains.radius[j];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 >= minD * minD || d2 < 1e-12) continue;
                    const d = Math.sqrt(d2);
                    const pen = minD - d;
                    const invD = 1 / d;
                    const nx = dx * invD;
                    const ny = dy * invD;
                    const nz = dz * invD;
                    const corr = pen * 0.5;
                    grains.pos[i3] += nx * corr;
                    grains.pos[i3 + 1] += ny * corr;
                    grains.pos[i3 + 2] += nz * corr;
                    grains.pos[j3] -= nx * corr;
                    grains.pos[j3 + 1] -= ny * corr;
                    grains.pos[j3 + 2] -= nz * corr;

                    const rvx = grains.vel[i3] - grains.vel[j3];
                    const rvy = grains.vel[i3 + 1] - grains.vel[j3 + 1];
                    const rvz = grains.vel[i3 + 2] - grains.vel[j3 + 2];
                    const vn = rvx * nx + rvy * ny + rvz * nz;
                    const tvx = rvx - vn * nx;
                    const tvy = rvy - vn * ny;
                    const tvz = rvz - vn * nz;
                    const tvLen = Math.sqrt(tvx * tvx + tvy * tvy + tvz * tvz);
                    if (tvLen > 1e-6) {
                      const maxFric = Math.abs(vn) * GRAIN_GRAIN_FRICTION;
                      const f = Math.min(tvLen, maxFric) / tvLen;
                      const fx = tvx * f * 0.5;
                      const fy = tvy * f * 0.5;
                      const fz = tvz * f * 0.5;
                      grains.vel[i3] -= fx;
                      grains.vel[i3 + 1] -= fy;
                      grains.vel[i3 + 2] -= fz;
                      grains.vel[j3] += fx;
                      grains.vel[j3 + 1] += fy;
                      grains.vel[j3 + 2] += fz;
                    }
                    if (vn < -0.15) {
                      grains.asleep[i] = 0;
                      grains.asleep[j] = 0;
                      grains.sleepTimer[i] = 0;
                      grains.sleepTimer[j] = 0;
                    }
                  }
                }
              }
            }
            collideGlass(grains, i);
          }
        }

        // Update velocities from position delta and sleep state.
        let asleepCount = 0;
        let agitation = 0;
        for (let i = 0; i < grains.count; i += 1) {
          if (grains.bulb[i] === 2) continue;
          const i3 = i * 3;
          const vx = (grains.pos[i3] - grains.prev[i3]) / h;
          const vy = (grains.pos[i3 + 1] - grains.prev[i3 + 1]) / h;
          const vz = (grains.pos[i3 + 2] - grains.prev[i3 + 2]) / h;
          grains.vel[i3] = vx;
          grains.vel[i3 + 1] = vy;
          grains.vel[i3 + 2] = vz;
          const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          agitation += speed;
          if (speed < SLEEP_SPEED && gMag > 0.5) {
            grains.sleepTimer[i] += h;
            if (grains.sleepTimer[i] > SLEEP_DELAY) grains.asleep[i] = 1;
          } else {
            grains.sleepTimer[i] = 0;
            grains.asleep[i] = 0;
          }
          if (grains.asleep[i]) asleepCount += 1;
        }
        const active = Math.max(1, grains.count);
        metrics.settledFraction = asleepCount / active;
        metrics.agitation = agitation / active;
      }

      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      metrics.stepMs = t1 - t0;
      return metrics;
    },
  };
}
