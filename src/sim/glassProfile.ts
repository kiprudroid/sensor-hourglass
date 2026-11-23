import { GLASS_END_RADIUS, GLASS_HALF_HEIGHT, GLASS_MAX_RADIUS } from './constants';

const TABLE_SIZE = 513;

interface ControlPoint {
  y: number;
  r: number;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Smooth axisymmetric interior profile. The neck radius is an argument because
 * the aperture is derived from the selected duration (Beverloo inversion).
 */
export interface GlassProfile {
  neckRadius: number;
  maxRadius: number;
  halfHeight: number;
  /** Radius at signed height y, metres. */
  radiusAt(y: number): number;
  /** dr/dy at signed height y. */
  slopeAt(y: number): number;
  /** Interior volume from -halfHeight up to y, cubic metres. */
  volumeBelow(y: number): number;
  /** Total interior volume, cubic metres. */
  readonly volume: number;
  readonly radiusTable: Float32Array;
}

export function createGlassProfile(neckRadius: number): GlassProfile {
  const end = GLASS_END_RADIUS;
  const max = GLASS_MAX_RADIUS;
  const points: ControlPoint[] = [
    { y: 0, r: neckRadius },
    { y: 0.009, r: neckRadius + (max - neckRadius) * 0.22 },
    { y: 0.024, r: neckRadius + (max - neckRadius) * 0.82 },
    { y: 0.048, r: max },
    { y: 0.069, r: max - (max - end) * 0.3 },
    { y: GLASS_HALF_HEIGHT, r: end },
  ];

  const radiusTable = new Float32Array(TABLE_SIZE);
  const dy = (2 * GLASS_HALF_HEIGHT) / (TABLE_SIZE - 1);
  for (let i = 0; i < TABLE_SIZE; i += 1) {
    const y = -GLASS_HALF_HEIGHT + i * dy;
    const a = Math.abs(y);
    let segment = points.length - 2;
    for (let s = 0; s < points.length - 1; s += 1) {
      if (a <= points[s + 1].y) {
        segment = s;
        break;
      }
    }
    const p0 = points[segment];
    const p1 = points[segment + 1];
    const t = smoothstep((a - p0.y) / (p1.y - p0.y));
    radiusTable[i] = p0.r + (p1.r - p0.r) * t;
  }

  const slopeTable = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i += 1) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(TABLE_SIZE - 1, i + 1);
    slopeTable[i] = (radiusTable[hi] - radiusTable[lo]) / ((hi - lo) * dy);
  }

  const cumulativeVolume = new Float64Array(TABLE_SIZE);
  for (let i = 1; i < TABLE_SIZE; i += 1) {
    const r0 = radiusTable[i - 1];
    const r1 = radiusTable[i];
    cumulativeVolume[i] =
      cumulativeVolume[i - 1] + Math.PI * dy * (r0 * r0 + r1 * r1) * 0.5;
  }
  const totalVolume = cumulativeVolume[TABLE_SIZE - 1];

  const toIndex = (y: number): number =>
    ((y + GLASS_HALF_HEIGHT) / (2 * GLASS_HALF_HEIGHT)) * (TABLE_SIZE - 1);

  return {
    neckRadius,
    maxRadius: max,
    halfHeight: GLASS_HALF_HEIGHT,
    radiusAt(y: number): number {
      const idx = Math.min(TABLE_SIZE - 1, Math.max(0, toIndex(y)));
      const lo = Math.floor(idx);
      const hi = Math.min(TABLE_SIZE - 1, lo + 1);
      const f = idx - lo;
      return radiusTable[lo] + (radiusTable[hi] - radiusTable[lo]) * f;
    },
    slopeAt(y: number): number {
      const idx = Math.min(TABLE_SIZE - 1, Math.max(0, toIndex(y)));
      const lo = Math.floor(idx);
      const hi = Math.min(TABLE_SIZE - 1, lo + 1);
      const f = idx - lo;
      return slopeTable[lo] + (slopeTable[hi] - slopeTable[lo]) * f;
    },
    volumeBelow(y: number): number {
      const idx = Math.min(TABLE_SIZE - 1, Math.max(0, toIndex(y)));
      const lo = Math.floor(idx);
      const hi = Math.min(TABLE_SIZE - 1, lo + 1);
      const f = idx - lo;
      return cumulativeVolume[lo] + (cumulativeVolume[hi] - cumulativeVolume[lo]) * f;
    },
    volume: totalVolume,
    radiusTable,
  };
}
