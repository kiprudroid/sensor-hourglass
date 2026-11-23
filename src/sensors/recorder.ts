import type { SensorTrace, SensorSample } from '../sim/types';

export interface SensorRecorder {
  start(platform: SensorTrace['platform']): void;
  stop(): SensorTrace | null;
  push(sample: SensorSample): void;
  readonly recording: boolean;
}

export function createSensorRecorder(): SensorRecorder {
  let samples: SensorSample[] = [];
  let platform: SensorTrace['platform'] = 'unknown';
  let recording = false;
  let t0 = 0;

  return {
    get recording() {
      return recording;
    },
    start(p) {
      platform = p;
      samples = [];
      recording = true;
      t0 = Date.now();
    },
    push(sample) {
      if (!recording) return;
      samples.push({
        ...sample,
        t: sample.t ?? Date.now() - t0,
      });
    },
    stop() {
      if (!recording) return null;
      recording = false;
      return {
        format: 'hourglass-device-motion-v1',
        platform,
        sampleRateHz: 60,
        samples: [...samples],
      };
    },
  };
}
