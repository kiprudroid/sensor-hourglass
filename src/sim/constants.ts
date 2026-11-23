/** All lengths are metres, times seconds, masses kilograms. */
export const G0 = 9.80665;

/** Glass interior, axisymmetric about Y. */
export const GLASS_HALF_HEIGHT = 0.09;
export const GLASS_MAX_RADIUS = 0.03;
export const GLASS_END_RADIUS = 0.018;
export const GLASS_WALL_THICKNESS = 0.0022;

/** Sand bulk. */
export const BULB_FILL_FRACTION = 0.55;
export const PACKING_FRACTION = 0.6;
export const BULK_DENSITY = 1600;

/** Beverloo discharge law. */
export const BEVERLOO_C = 0.58;
export const BEVERLOO_K = 1.4;
/** Widest neck we allow for the shortest duration. */
export const MAX_NECK_DIAMETER = 0.0096;

/** Contact model. Angle of repose emerges from this, it is not scripted. */
export const REPOSE_DEGREES = 34;
export const FRICTION_MU = Math.tan((REPOSE_DEGREES * Math.PI) / 180);
export const GRAIN_GRAIN_FRICTION = FRICTION_MU;
export const GRAIN_GLASS_FRICTION = FRICTION_MU * 1.15;
export const RESTITUTION = 0.04;
export const ROLLING_RESISTANCE = 0.045;
export const SLEEP_SPEED = 0.0035;
export const SLEEP_DELAY = 0.35;

/** Sensor conditioning. */
export const SENSOR_HZ = 60;
export const SENSOR_CUTOFF_HZ = 30;
export const MAX_GRAVITY_G = 4;
export const MAX_GRAVITY = G0 * MAX_GRAVITY_G;
export const MAX_GRAVITY_RATE = 55;

/** Simulation limits. */
export const MAX_SUBSTEPS = 6;
export const MAX_GRAIN_SPEED = 2.5;
export const SOLVER_ITERATIONS = 3;
export const CAPTURE_HEIGHT = 0.014;
export const EVENT_CAPACITY = 64;

export const MIN_DURATION_SECONDS = 10;
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

export const DEFAULT_TIER_GRAINS = {
  low: 1500,
  medium: 2500,
  high: 4000,
} as const;
