import type { SensorTrace, Vec3 } from './types';

export interface ReplayController {
  readonly trace: SensorTrace;
  timeMs: number;
  reset(): void;
  /** Advance replay clock and return gravity sample in glass/device frame. */
  sample(dtMs: number): Vec3;
}

function normalize(raw: Vec3): Vec3 {
  // g_eff = -(specific force including gravity), Expo DeviceMotion m/s^2.
  return { x: -raw.x, y: -raw.y, z: -raw.z };
}

export function createReplay(trace: SensorTrace): ReplayController {
  let index = 0;
  let timeMs = 0;
  const gravity: Vec3 = { x: 0, y: -9.80665, z: 0 };

  const apply = (i: number) => {
    const s = trace.samples[i];
    if (!s) return;
    const g = normalize(s.accelerationIncludingGravity);
    gravity.x = g.x;
    gravity.y = g.y;
    gravity.z = g.z;
  };

  return {
    trace,
    get timeMs() {
      return timeMs;
    },
    set timeMs(v: number) {
      timeMs = v;
    },
    reset() {
      index = 0;
      timeMs = 0;
      apply(0);
    },
    sample(dtMs: number) {
      timeMs += dtMs;
      while (index + 1 < trace.samples.length && trace.samples[index + 1].t <= timeMs) {
        index += 1;
      }
      apply(index);
      return gravity;
    },
  };
}

export function recordTrace(
  samples: SensorTrace['samples'],
  platform: SensorTrace['platform'],
): SensorTrace {
  return {
    format: 'hourglass-device-motion-v1',
    platform,
    sampleRateHz: 60,
    samples,
  };
}
