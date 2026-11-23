import {
  DEFAULT_TIER_GRAINS,
  G0,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from './constants';
import {
  countBulbs,
  createGrainBuffers,
  fillUpperBulb,
  resetGrainDynamics,
} from './grains';
import { createGlassProfile } from './glassProfile';
import { createFluxController, neckDiameterForDuration } from './flux';
// rng available for deterministic rebuilds via sim/rng.ts
import { createSolver } from './solver';
import type {
  GrainBuffers,
  QualityTier,
  SimConfig,
  SimCounts,
  SimMetrics,
  SimSnapshot,
  TierConfig,
  TimekeepingMode,
  Vec3,
} from './types';

export * from './constants';
export * from './types';
export * from './glassProfile';
export * from './grains';
export * from './rng';

export interface HourglassSim {
  readonly grains: GrainBuffers;
  readonly config: SimConfig;
  readonly metrics: SimMetrics;
  step(gravity: Vec3, dt: number): SimMetrics;
  reset(durationSeconds: number, seed?: number): void;
  setTimekeeping(mode: TimekeepingMode): void;
  counts(): SimCounts;
  snapshot(): SimSnapshot;
  restore(snap: SimSnapshot): void;
  /** Remaining physical time based on top-bulb grains and nominal Q0. */
  remainingSeconds(gravity: Vec3): number;
  nominalFlux(): number;
  neckDiameter(): number;
  streamPoints(
    gravity: Vec3,
  ): { sx: number; sy: number; sz: number; tx: number; ty: number; tz: number } | null;
}

export function getTierConfig(tier: QualityTier): TierConfig {
  switch (tier) {
    case 'low':
      return {
        tier,
        grains: DEFAULT_TIER_GRAINS.low,
        hz: 30,
        substeps: 1,
        iterations: 2,
        rung: 'R2',
        renderScale: 0.6,
        blurPasses: 0,
        refraction: false,
        shadowMaps: false,
      };
    case 'medium':
      return {
        tier,
        grains: DEFAULT_TIER_GRAINS.medium,
        hz: 60,
        substeps: 2,
        iterations: 2,
        rung: 'R1',
        renderScale: 0.75,
        blurPasses: 1,
        refraction: false,
        shadowMaps: false,
      };
    case 'high':
    default:
      return {
        tier,
        grains: DEFAULT_TIER_GRAINS.high,
        hz: 60,
        substeps: 3,
        iterations: 3,
        rung: 'R1',
        renderScale: 1,
        blurPasses: 2,
        refraction: true,
        shadowMaps: false,
      };
  }
}

export function clampDuration(seconds: number): number {
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, seconds));
}

export function createHourglassSim(
  initial: {
    tier?: QualityTier;
    durationSeconds?: number;
    timekeeping?: TimekeepingMode;
    seed?: number;
    grains?: number;
  } = {},
): HourglassSim {
  const baseTier = getTierConfig(initial.tier ?? 'medium');
  const tier: TierConfig = initial.grains
    ? { ...baseTier, grains: initial.grains }
    : baseTier;
  const durationSeconds = clampDuration(initial.durationSeconds ?? 60);
  const seed = initial.seed ?? 1;
  const grainR = 0.0018; // temp; recomputed on reset
  const neckDiameter = neckDiameterForDuration(tier.grains, durationSeconds, grainR);
  const neckRadius = neckDiameter / 2;
  const grains = createGrainBuffers(tier.grains);
  const solver = createSolver(neckRadius, tier.grains);
  let profile = createGlassProfile(neckRadius);
  let flux = createFluxController(profile, tier.grains, durationSeconds);

  const config: SimConfig = {
    tier,
    durationSeconds,
    timekeeping: initial.timekeeping ?? 'physical',
    neckRadius,
    seed,
  };
  let metrics: SimMetrics = {
    stepMs: 0,
    settledFraction: 0,
    agitation: 0,
    flowGrainsPerSecond: 0,
    gravityMagnitude: G0,
    gn: G0,
  };

  const doReset = (duration: number, nextSeed = config.seed): void => {
    config.durationSeconds = clampDuration(duration);
    config.seed = nextSeed;
    const r = computeGrainRadiusFromConfig(config);
    const nd = neckDiameterForDuration(config.tier.grains, config.durationSeconds, r);
    config.neckRadius = nd / 2;
    solver.setNeckRadius(config.neckRadius);
    profile = createGlassProfile(config.neckRadius);
    fillUpperBulb(grains, config.neckRadius, config.seed, config.tier.grains);
    flux = createFluxController(profile, config.tier.grains, config.durationSeconds);
    resetGrainDynamics(grains);
  };

  function computeGrainRadiusFromConfig(cfg: SimConfig): number {
    const p = createGlassProfile(cfg.neckRadius || 0.002);
    const targetSandVolume = p.volume * 0.5 * 0.55;
    const grainVolume = (targetSandVolume * 0.6) / cfg.tier.grains;
    return Math.cbrt((3 * grainVolume) / (4 * Math.PI));
  }

  // initial fill
  fillUpperBulb(grains, config.neckRadius, seed, tier.grains);
  flux.reset(tier.grains, durationSeconds);

  let flowSmoothed = 0;

  const sim: HourglassSim = {
    grains,
    config,
    get metrics() {
      return metrics;
    },
    step(gravity: Vec3, dt: number): SimMetrics {
      const clampedDt = Math.min(0.05, Math.max(0.001, dt));
      const moved = flux.update(grains, gravity, clampedDt, config.timekeeping);
      flux.updateStream(grains, gravity, clampedDt);
      metrics = solver.step(
        grains,
        gravity,
        clampedDt,
        config.tier.substeps,
        config.tier.iterations,
      );
      flowSmoothed = flowSmoothed * 0.9 + (moved / clampedDt) * 0.1;
      metrics.flowGrainsPerSecond = flowSmoothed;
      return metrics;
    },
    reset(duration: number, nextSeed = config.seed) {
      doReset(duration, nextSeed);
    },
    setTimekeeping(mode: TimekeepingMode) {
      config.timekeeping = mode;
    },
    counts() {
      return countBulbs(grains);
    },
    snapshot(): SimSnapshot {
      const c = countBulbs(grains);
      return {
        version: 1,
        counts: c,
        gravity: { x: 0, y: -G0, z: 0 },
        elapsedSeconds: 0,
        timestamp: Date.now(),
        durationSeconds: config.durationSeconds,
        seed: config.seed,
      };
    },
    restore(_snap: SimSnapshot) {
      // Full restore handled by app-level fast-forward/rebuild; sim exposes primitives.
    },
    remainingSeconds(gravity: Vec3) {
      const c = countBulbs(grains);
      const upstreamIsUpper = gravity.y <= 0;
      const remaining = upstreamIsUpper ? c.upper : c.lower;
      return remaining / Math.max(0.001, flux.nominalFlux);
    },
    nominalFlux() {
      return flux.nominalFlux;
    },
    neckDiameter() {
      return flux.neckDiameter;
    },
    streamPoints(gravity: Vec3) {
      const gMag =
        Math.sqrt(
          gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z,
        ) || G0;
      const gx = gravity.x / gMag;
      const gy = gravity.y / gMag;
      const gz = gravity.z / gMag;
      const c = countBulbs(grains);
      const flowing = (gy < -0.1 && c.upper > 0) || (gy > 0.1 && c.lower > 0);
      if (!flowing) return null;
      const sy = gy < 0 ? -0.002 : 0.002;
      const sx = 0;
      const sz = 0;
      const tx = sx + gx * 0.045;
      const ty = sy + gy * 0.045;
      const tz = sz + gz * 0.045;
      return { sx, sy, sz, tx, ty, tz };
    },
  };
  return sim;
}
