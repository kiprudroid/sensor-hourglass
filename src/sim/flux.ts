import { BEVERLOO_C, BEVERLOO_K, BULK_DENSITY, G0, MAX_NECK_DIAMETER } from './constants';
import { computeGrainRadius } from './grains';
import type { GlassProfile } from './glassProfile';
import type { GrainBuffers, ImpactEvent, Vec3 } from './types';

export interface FluxController {
  /** Meter grains through neck; moves grains from upper to stream/inflight. */
  update(
    grains: GrainBuffers,
    gravity: Vec3,
    dt: number,
    timekeeping: 'physical' | 'strict',
  ): number;
  /** Advance in-flight grains and reintroduce on impact. */
  updateStream(grains: GrainBuffers, gravity: Vec3, dt: number): ImpactEvent | null;
  readonly nominalFlux: number;
  readonly neckDiameter: number;
  reset(totalGrains: number, durationSeconds: number): void;
  streamProgress(): number;
}

interface StreamGrain {
  index: number;
  t: number;
  duration: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  destBulb: 0 | 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function neckDiameterForDuration(
  totalGrains: number,
  durationSeconds: number,
  grainRadius: number,
): number {
  // Invert Beverloo: Q_mass = C*rho*sqrt(g)*(D0-k*d)^2.5, Q_grains = Q_mass / m_grain
  const grainVol = (4 / 3) * Math.PI * grainRadius ** 3;
  const grainMass = grainVol * BULK_DENSITY;
  const qMass = (totalGrains * grainMass) / Math.max(1, durationSeconds);
  const d = grainRadius * 2;
  const inner = Math.pow(qMass / (BEVERLOO_C * BULK_DENSITY * Math.sqrt(G0)), 1 / 2.5);
  const D0 = inner + BEVERLOO_K * d;
  return clamp(D0, d * 2.2, MAX_NECK_DIAMETER);
}

export function createFluxController(
  profile: GlassProfile,
  totalGrains: number,
  durationSeconds: number,
): FluxController {
  let nominalFlux = totalGrains / Math.max(1, durationSeconds);
  let accumulator = 0;
  const inStream: StreamGrain[] = [];
  let grainRadius = 0.0015;
  let neckDiameter = 0.004;

  const findImpact = (
    gravity: Vec3,
    sx: number,
    sy: number,
    sz: number,
  ): [number, number, number] => {
    const gMag =
      Math.sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z) ||
      G0;
    const gx = gravity.x / gMag;
    const gy = gravity.y / gMag;
    const gz = gravity.z / gMag;
    // Cast along g_eff until we hit lower bulb interior or bottom cap.
    let t = 0;
    let x = sx;
    let y = sy;
    let z = sz;
    for (let step = 0; step < 120; step += 1) {
      t += 0.0015;
      x = sx + gx * t;
      y = sy + gy * t;
      z = sz + gz * t;
      const rad = Math.sqrt(x * x + z * z);
      const limit = Math.max(0.0005, profile.radiusAt(y) - grainRadius);
      if (y < -profile.halfHeight + grainRadius) {
        return [x * 0.8, -profile.halfHeight + grainRadius, z * 0.8];
      }
      if (rad > limit && y < -0.002) {
        const inv = limit / (rad || 1);
        return [x * inv, y, z * inv];
      }
      // Hit pile approximation: settle near bottom if deep in lower bulb.
      if (y < -0.01) {
        const pileY = -profile.halfHeight * 0.55 + Math.sqrt(x * x + z * z) * 0.45;
        if (y <= pileY) return [x, pileY, z];
      }
    }
    return [sx, -0.04, sz];
  };

  const pickCaptureGrain = (
    grains: GrainBuffers,
    gravity: Vec3,
    strict: boolean,
  ): number => {
    const gMag =
      Math.sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z) ||
      G0;
    const gy = gravity.y / gMag;
    const upstreamBulb = gy < 0 ? 0 : 1;
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < grains.count; i += 1) {
      if (grains.bulb[i] !== upstreamBulb) continue;
      const i3 = i * 3;
      const y = grains.pos[i3 + 1];
      const x = grains.pos[i3];
      const z = grains.pos[i3 + 2];
      // Capture region: near neck, on the upstream side.
      const nearNeck =
        upstreamBulb === 0 ? y < 0.03 && y > -0.005 : y > -0.03 && y < 0.005;
      if (!nearNeck) continue;
      const radial = x * x + z * z;
      const neckDist = Math.abs(y) + radial * 20;
      if (neckDist < bestScore) {
        bestScore = neckDist;
        best = i;
      }
    }
    if (best >= 0) return best;
    // Fallback: lowest/highest grain in upstream bulb - solver will settle others.
    for (let i = 0; i < grains.count; i += 1) {
      if (grains.bulb[i] !== upstreamBulb) continue;
      const y = grains.pos[i * 3 + 1];
      const score = upstreamBulb === 0 ? y : -y;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) return best;
    if (!strict) return -1;
    for (let i = 0; i < grains.count; i += 1) {
      if (grains.bulb[i] !== 2) return i;
    }
    return -1;
  };

  return {
    get nominalFlux() {
      return nominalFlux;
    },
    get neckDiameter() {
      return neckDiameter;
    },
    reset(total: number, durationSeconds: number) {
      nominalFlux = total / Math.max(1, durationSeconds);
      accumulator = 0;
      inStream.length = 0;
      grainRadius = computeGrainRadius(profile.volume, total);
      neckDiameter = neckDiameterForDuration(total, durationSeconds, grainRadius);
    },
    streamProgress() {
      return inStream.length > 0 ? inStream[0].t / inStream[0].duration : 0;
    },
    update(grains, gravity, dt, timekeeping) {
      const gMag = Math.sqrt(
        gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z,
      );
      const gn = Math.abs(gravity.y);
      const physicalFactor = gMag < 0.05 ? 0 : Math.sqrt(clamp(gn / G0, 0, 1));
      const factor = timekeeping === 'strict' ? 1 : physicalFactor;
      if (factor <= 0) return 0;
      accumulator += nominalFlux * factor * dt;
      let moved = 0;
      while (accumulator >= 1) {
        const idx = pickCaptureGrain(grains, gravity, timekeeping === 'strict');
        if (idx < 0) {
          accumulator = Math.min(accumulator, 1);
          break;
        }
        accumulator -= 1;
        const i3 = idx * 3;
        const sx = grains.pos[i3];
        const sy = grains.pos[i3 + 1];
        const sz = grains.pos[i3 + 2];
        grains.bulb[idx] = 2;
        grains.asleep[idx] = 0;
        grains.sleepTimer[idx] = 0;
        // Park in-flight grain off-profile; renderer ignores bulb==2.
        grains.pos[i3] = 0;
        grains.pos[i3 + 1] = 0;
        grains.pos[i3 + 2] = 0;
        grains.vel[i3] = 0;
        grains.vel[i3 + 1] = 0;
        grains.vel[i3 + 2] = 0;
        const [tx0, ty0, tz0] = findImpact(gravity, sx, sy, sz);
        let tx = tx0,
          ty = ty0,
          tz = tz0;
        const upstreamBulb: 0 | 1 = gravity.y < 0 ? 0 : 1;
        const destBulb: 0 | 1 = upstreamBulb === 0 ? 1 : 0;
        // If impact ended in same bulb or horizontal gravity ambiguous, force destination bulb.
        const impactBulb: 0 | 1 = ty < 0 ? 1 : 0;
        if (impactBulb !== destBulb) {
          ty = destBulb === 0 ? 0.04 : -0.04;
          tx = sx * 0.3;
          tz = sz * 0.3;
        }
        const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2 + (tz - sz) ** 2);
        const speed = Math.max(
          0.25,
          Math.sqrt(2 * Math.max(gMag, 0.5) * Math.max(dist, 0.01)),
        );
        inStream.push({
          index: idx,
          t: 0,
          duration: clamp(dist / speed, 0.03, 0.8),
          sx,
          sy,
          sz,
          tx,
          ty,
          tz,
          destBulb,
        });
        moved += 1;
      }
      return moved;
    },
    updateStream(grains, gravity, dt) {
      if (inStream.length === 0) return null;
      let impact: ImpactEvent | null = null;
      for (let i = inStream.length - 1; i >= 0; i -= 1) {
        const s = inStream[i];
        s.t += dt;
        if (s.t >= s.duration) {
          const idx = s.index;
          const i3 = idx * 3;
          grains.bulb[idx] = s.destBulb;
          grains.pos[i3] = s.tx;
          grains.pos[i3 + 1] = s.ty;
          grains.pos[i3 + 2] = s.tz;
          grains.prev[i3] = s.tx;
          grains.prev[i3 + 1] = s.ty;
          grains.prev[i3 + 2] = s.tz;
          const gMag =
            Math.sqrt(
              gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z,
            ) || G0;
          grains.vel[i3] = (gravity.x / gMag) * 0.08;
          grains.vel[i3 + 1] = (gravity.y / gMag) * 0.08;
          grains.vel[i3 + 2] = (gravity.z / gMag) * 0.08;
          grains.asleep[idx] = 0;
          grains.sleepTimer[idx] = 0;
          impact = { x: s.tx, y: s.ty, z: s.tz, strength: 1 };
          inStream.splice(i, 1);
        }
      }
      return impact;
    },
  };
}
