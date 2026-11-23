import { createHourglassSim } from './index';
import { G0 } from './constants';

const tiers = ['low', 'medium', 'high'] as const;
for (const tier of tiers) {
  const sim = createHourglassSim({ tier, durationSeconds: 60, seed: 1 });
  const steps = 300;
  const t0 = performance.now();
  for (let i = 0; i < steps; i += 1) sim.step({ x: 0, y: -G0, z: 0 }, 1 / 60);
  const t1 = performance.now();
  const ms = (t1 - t0) / steps;
  console.warn(
    `${tier}: ${sim.grains.count} grains, ${ms.toFixed(3)} ms/step avg over ${steps}`,
  );
}
