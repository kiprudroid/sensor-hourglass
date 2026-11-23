import type { Vec3 } from './types';

export interface StreamState {
  active: boolean;
  origin: Vec3;
  impact: Vec3;
  width: number;
}

/** Continuity: constant mass flux, increasing speed => narrowing thread. */
export function streamWidthAt(
  baseWidth: number,
  distanceFromNeck: number,
  gravityMagnitude: number,
): number {
  const g = Math.max(0.5, gravityMagnitude);
  const speed = Math.sqrt(2 * g * Math.max(0.0005, distanceFromNeck) + 0.01);
  const width = baseWidth * Math.sqrt(0.15 / speed);
  return Math.max(0.0004, width);
}

export function computeStream(
  gravity: Vec3,
  neckY: number,
  neckRadius: number,
  impact: Vec3 | null,
): StreamState {
  const gMag = Math.sqrt(
    gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z,
  );
  if (gMag < 0.2 || !impact) {
    return {
      active: false,
      origin: { x: 0, y: neckY, z: 0 },
      impact: { x: 0, y: neckY, z: 0 },
      width: neckRadius * 0.4,
    };
  }
  return {
    active: true,
    origin: { x: 0, y: neckY, z: 0 },
    impact,
    width: Math.max(0.0008, neckRadius * 0.45),
  };
}
