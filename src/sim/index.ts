import { G0, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from './constants';
import { createHeightfield, fillUpper, stepHeightfield, type HeightfieldSim } from './heightfield';
import type { QualityTier, SimConfig, SimMetrics, TierConfig, TimekeepingMode, Vec3 } from './types';

export * from './constants';
export * from './types';
export * from './heightfield';

export interface HourglassSim {
  readonly config: SimConfig;
  readonly metrics: SimMetrics;
  readonly hf: HeightfieldSim;
  /** Compatibility: grain-like count for UI/logic; represents volume units. */
  readonly grains: { count: number; pos: Float32Array; bulb: Uint8Array; radius: Float32Array; capacity: number };
  step(gravity: Vec3, dt: number): SimMetrics;
  reset(durationSeconds: number, seed?: number): void;
  setTimekeeping(mode: TimekeepingMode): void;
  counts(): { upper: number; lower: number; inflight: number };
  remainingSeconds(gravity: Vec3): number;
  nominalFlux(): number;
  neckDiameter(): number;
}

export function getTierConfig(tier: QualityTier): TierConfig {
  switch (tier) {
    case 'low':
      return { tier, grains: 0, hz: 60, substeps: 1, iterations: 1, rung: 'R2', renderScale: 0.75, blurPasses: 0, refraction: false, shadowMaps: false };
    case 'medium':
      return { tier, grains: 0, hz: 60, substeps: 1, iterations: 1, rung: 'R2', renderScale: 1, blurPasses: 0, refraction: false, shadowMaps: false };
    case 'high':
    default:
      return { tier, grains: 0, hz: 60, substeps: 1, iterations: 1, rung: 'R1', renderScale: 1, blurPasses: 1, refraction: false, shadowMaps: false };
  }
}

export function clampDuration(seconds: number): number {
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, seconds));
}

export function createHourglassSim(initial: {
  tier?: QualityTier;
  durationSeconds?: number;
  timekeeping?: TimekeepingMode;
  seed?: number;
  grains?: number;
} = {}): HourglassSim {
  const tier = getTierConfig(initial.tier ?? 'medium');
  const durationSeconds = clampDuration(initial.durationSeconds ?? 60);
  const seed = initial.seed ?? 1;
  const hf = createHeightfield(32);
  fillUpper(hf, 1);
  const TOTAL_VOLUME = hf.totalUpper(); // actual filled volume in cell-height units

  const config: SimConfig = {
    tier,
    durationSeconds,
    timekeeping: initial.timekeeping ?? 'physical',
    neckRadius: 0.003,
    seed,
  };

  let metrics: SimMetrics = {
    stepMs: 0,
    settledFraction: 1,
    agitation: 0,
    flowGrainsPerSecond: 0,
    gravityMagnitude: G0,
    gn: G0,
  };

  // Compatibility stub for old scene; not used by new scene.
  const compat = { count: 0, pos: new Float32Array(0), bulb: new Uint8Array(0), radius: new Float32Array(0), capacity: 0 };

  const sim: HourglassSim = {
    config,
    hf,
    grains: compat,
    get metrics() {
      return metrics;
    },
    step(gravity: Vec3, dt: number): SimMetrics {
      const t0 = performance.now();
      const clampedDt = Math.min(0.05, Math.max(0.001, dt));
      const gMag = Math.sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z) || G0;
      metrics.gravityMagnitude = gMag;
      metrics.gn = Math.abs(gravity.y);
      const flowRate = TOTAL_VOLUME / Math.max(1, config.durationSeconds);
      const physicalFactor = config.timekeeping === 'strict' ? 1 : Math.sqrt(Math.max(0, Math.abs(gravity.y) / G0));
      const effectiveFlow = gMag < 0.2 ? 0 : flowRate * (config.timekeeping === 'strict' ? 1 : physicalFactor);
      stepHeightfield(hf, gravity, clampedDt, effectiveFlow);
      metrics.flowGrainsPerSecond = effectiveFlow;
      // agitation estimate from velocities
      let ag = 0;
      for (let i = 0; i < hf.velXU.length; i += 1) {
        ag += Math.abs(hf.velXU[i]) + Math.abs(hf.velZU[i]) + Math.abs(hf.velXL[i]) + Math.abs(hf.velZL[i]);
      }
      metrics.agitation = ag / (hf.velXU.length * 2);
      metrics.stepMs = performance.now() - t0;
      return metrics;
    },
    reset(duration: number) {
      config.durationSeconds = clampDuration(duration);
      fillUpper(hf, TOTAL_VOLUME);
    },
    setTimekeeping(mode: TimekeepingMode) {
      config.timekeeping = mode;
    },
    counts() {
      const upper = hf.totalUpper();
      const lower = hf.totalLower();
      return { upper: Math.round(upper), lower: Math.round(lower), inflight: 0 };
    },
    remainingSeconds(gravity: Vec3) {
      const upstreamIsUpper = gravity.y <= 0;
      const remaining = upstreamIsUpper ? hf.totalUpper() : hf.totalLower();
      const flowRate = TOTAL_VOLUME / Math.max(1, config.durationSeconds);
      return remaining / Math.max(0.001, flowRate);
    },
    nominalFlux() {
      return TOTAL_VOLUME / Math.max(1, config.durationSeconds);
    },
    neckDiameter() {
      return 0.006;
    },
  };
  return sim;
}
