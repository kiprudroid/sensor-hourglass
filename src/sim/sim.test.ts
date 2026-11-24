import { describe, expect, test } from 'bun:test';
import { createHourglassSim } from './index';
import { G0 } from './constants';

function runSim(
  sim: ReturnType<typeof createHourglassSim>,
  seconds: number,
  gravity = { x: 0, y: -G0, z: 0 },
  dt = 1 / 60,
) {
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i += 1) sim.step(gravity, dt);
}

describe('heightfield hourglass sim', () => {
  test('conserves total volume', () => {
    const sim = createHourglassSim({ durationSeconds: 30, seed: 1 });
    const before = sim.counts();
    const total0 = before.upper + before.lower + before.inflight;
    runSim(sim, 5);
    const after = sim.counts();
    const total1 = after.upper + after.lower + after.inflight;
    expect(Math.abs(total1 - total0)).toBeLessThan(total0 * 0.02);
  });

  test('upright drains upper to lower', () => {
    const sim = createHourglassSim({ durationSeconds: 20, seed: 2 });
    const start = sim.counts();
    runSim(sim, 5, { x: 0, y: -G0, z: 0 });
    const end = sim.counts();
    expect(end.lower).toBeGreaterThan(start.lower);
    expect(end.upper).toBeLessThan(start.upper);
  });

  test('horizontal tilt reduces flow', () => {
    const sim = createHourglassSim({ durationSeconds: 20, seed: 3 });
    runSim(sim, 1);
    const before = sim.counts();
    runSim(sim, 3, { x: G0, y: 0, z: 0 });
    const after = sim.counts();
    expect(Math.abs(after.lower - before.lower)).toBeLessThan(5);
  });

  test('flip reverses upstream', () => {
    const sim = createHourglassSim({ durationSeconds: 20, seed: 4 });
    runSim(sim, 4, { x: 0, y: -G0, z: 0 });
    const remDown = sim.remainingSeconds({ x: 0, y: -G0, z: 0 });
    const remUp = sim.remainingSeconds({ x: 0, y: G0, z: 0 });
    expect(remDown).toBeGreaterThan(remUp);
  });

  test('strict mode flows regardless of tilt', () => {
    const sim = createHourglassSim({ durationSeconds: 20, seed: 5, timekeeping: 'strict' });
    runSim(sim, 1);
    const before = sim.counts();
    runSim(sim, 3, { x: G0, y: 0, z: 0 });
    const after = sim.counts();
    expect(after.upper + after.lower).toBeGreaterThan(0);
    expect(Math.abs(after.lower - before.lower)).toBeGreaterThan(0);
  });
});
