/** Pure simulation contracts. No React, no three, no DOM. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type QualityTier = 'low' | 'medium' | 'high';
export type RenderRung = 'R1' | 'R2' | 'R3';
export type TimekeepingMode = 'physical' | 'strict';

export interface TierConfig {
  tier: QualityTier;
  grains: number;
  hz: number;
  substeps: number;
  iterations: number;
  rung: RenderRung;
  renderScale: number;
  blurPasses: number;
  refraction: boolean;
  shadowMaps: boolean;
}

export interface SimConfig {
  tier: TierConfig;
  durationSeconds: number;
  timekeeping: TimekeepingMode;
  /** Neck aperture in metres, derived from the Beverloo inversion. */
  neckRadius: number;
  seed: number;
}

/** Mutable typed-array grain store. Everything the hot loop touches lives here. */
export interface GrainBuffers {
  readonly capacity: number;
  count: number;
  /** xyz triplets, metres, device/glass frame. */
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly vel: Float32Array;
  readonly radius: Float32Array;
  /** 0 = upper bulb (y>0), 1 = lower bulb (y<0), 2 = in flight. */
  readonly bulb: Uint8Array;
  /** Seconds of continuous low-velocity contact. */
  readonly sleepTimer: Float32Array;
  /** 1 when asleep. */
  readonly asleep: Uint8Array;
}

export interface SimCounts {
  upper: number;
  lower: number;
  inflight: number;
}

export interface SimMetrics {
  stepMs: number;
  settledFraction: number;
  agitation: number;
  flowGrainsPerSecond: number;
  gravityMagnitude: number;
  gn: number;
}

export interface ImpactEvent {
  x: number;
  y: number;
  z: number;
  strength: number;
}

/** Ring buffer of impact events; consumed by the renderer without allocation. */
export interface EventBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly strength: Float32Array;
  head: number;
  size: number;
  readonly capacity: number;
}

export interface SimSnapshot {
  version: 1;
  counts: SimCounts;
  gravity: Vec3;
  elapsedSeconds: number;
  timestamp: number;
  durationSeconds: number;
  seed: number;
}

export interface SensorSample {
  /** Milliseconds since trace start. */
  t: number;
  accelerationIncludingGravity: Vec3;
  rotationRate: Vec3;
  rotation: { alpha: number; beta: number; gamma: number };
}

export interface SensorTrace {
  format: 'hourglass-device-motion-v1';
  platform: 'ios' | 'android' | 'unknown';
  sampleRateHz: number;
  samples: SensorSample[];
}
