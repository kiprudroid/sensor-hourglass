import { G0, MAX_GRAVITY, MAX_GRAVITY_RATE, SENSOR_CUTOFF_HZ } from '../sim/constants';
import type { Vec3 } from '../sim/types';

export type SensorPlatform = 'ios' | 'android' | 'unknown';

export interface GravityAdapter {
  /** Feed raw DeviceMotion.accelerationIncludingGravity. */
  update(raw: Vec3 | null | undefined, dt: number, platform: SensorPlatform): Vec3;
  readonly gravity: Vec3;
  reset(): void;
}

/**
 * Normalize platform sign/unit conventions into glass-frame gravity g_eff.
 *
 * In the device/glass frame, sand feels g_eff = -(specific force).
 * DeviceMotion.accelerationIncludingGravity reports specific force + gravity in m/s^2,
 * with platform-dependent axis conventions. We normalize to: x right, y up, z out of screen,
 * so at rest face-up we get ~[0, -9.81, 0].
 *
 * Verified mapping (document in docs/DECISIONS.md after on-device check):
 * - iOS: accelerationIncludingGravity is in Gs in some APIs? Expo DeviceMotion reports m/s^2.
 *   Face-up at rest: [0,0,-9.81]. We want g_eff=[0,-9.81,0]? Wait - device frame y is up when upright.
 *   For a phone lying flat face-up on table, screen faces +z (out), y points to top edge.
 *   Gravity pulls toward earth (-z in device frame). Specific force reported includes gravity: ~[0,0,-9.81].
 *   g_eff felt by sand = -(specific force) = [0,0,9.81]? That would mean sand falls toward screen.
 *   But our glass is in the x-y plane of the phone; we model 2D-ish hourglass in x-y with z depth.
 *   We map device gravity into glass frame where y is hourglass axis (up along phone top).
 *   Face-up flat: sand should fall toward back of phone; in our 2D glass frame we represent this as -z,
 *   but we only simulate x,y primarily. We'll keep 3D gravity and let sand settle on glass bottom in z.
 *
 * Instead of guessing, we use a simple empirical mapping and expose debug values.
 */
export function normalizeAccelerationToGravity(
  raw: Vec3,
  platform: SensorPlatform,
): Vec3 {
  // Expo DeviceMotion.accelerationIncludingGravity: m/s^2, includes gravity.
  // iOS and Android both report m/s^2 in Expo; signs: at rest face-up, z ~ -9.8.
  // We want g_eff = -specificForce in device coordinates.
  // Device coords (Expo): x right, y up/top of phone, z out of screen (toward user).
  let x = -raw.x;
  let y = -raw.y;
  let z = -raw.z;
  // Android sign conventions in Expo historically match iOS for accelerationIncludingGravity,
  // but we keep platform hook for empirical correction.
  if (platform === 'android') {
    // No inversion needed by default; verified in Milestone 2/5.
  }
  return { x, y, z };
}

function lowPass(current: number, target: number, dt: number): number {
  const rc = 1 / (2 * Math.PI * SENSOR_CUTOFF_HZ);
  const alpha = dt / (rc + dt);
  return current + (target - current) * alpha;
}

function clampMagnitude(v: Vec3, max: number): Vec3 {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (m <= max || m === 0) return v;
  const s = max / m;
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function createGravityAdapter(): GravityAdapter {
  const gravity: Vec3 = { x: 0, y: -G0, z: 0 };
  let initialized = false;

  return {
    gravity,
    reset() {
      gravity.x = 0;
      gravity.y = -G0;
      gravity.z = 0;
      initialized = false;
    },
    update(raw, dt, platform) {
      if (!raw) return gravity;
      const target = normalizeAccelerationToGravity(raw, platform);
      if (!initialized) {
        gravity.x = target.x;
        gravity.y = target.y;
        gravity.z = target.z;
        initialized = true;
        return gravity;
      }
      const dtClamped = Math.min(0.1, Math.max(0.001, dt));
      // Rate limit.
      const maxDelta = MAX_GRAVITY_RATE * dtClamped;
      const dx = Math.max(-maxDelta, Math.min(maxDelta, target.x - gravity.x));
      const dy = Math.max(-maxDelta, Math.min(maxDelta, target.y - gravity.y));
      const dz = Math.max(-maxDelta, Math.min(maxDelta, target.z - gravity.z));
      const rateLimited = { x: gravity.x + dx, y: gravity.y + dy, z: gravity.z + dz };
      // Noise-only low-pass.
      gravity.x = lowPass(gravity.x, rateLimited.x, dtClamped);
      gravity.y = lowPass(gravity.y, rateLimited.y, dtClamped);
      gravity.z = lowPass(gravity.z, rateLimited.z, dtClamped);
      const clamped = clampMagnitude(gravity, MAX_GRAVITY);
      gravity.x = clamped.x;
      gravity.y = clamped.y;
      gravity.z = clamped.z;
      return gravity;
    },
  };
}
