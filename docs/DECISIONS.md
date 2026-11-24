# Decisions

## Environment & scope

- **Date**: 2026-11-24
- **Stack**: Expo SDK 58.0.26, React Native 0.88.1, React 19.3.0, Three 0.187.0, `@react-three/fiber/native` 9.8.2, `expo-gl` 58.0.4, Bun 1.4.4.
- **No WASM**: Simulation is pure TypeScript typed arrays.

## Heightfield redesign (2026-11-24)

User feedback after initial mobile run: ~1 FPS, very resource intensive, gravity/sensor feel weak, and individual grains visible instead of sand. The original PBD grain solver + instanced-sphere rendering was too expensive for Expo Go/mobile and did not read as sand.

### New approach

- **Simulation**: 32x32 heightfield per bulb (`src/sim/heightfield.ts`). Each cell stores sand volume/height. Horizontal slosh is driven by gravity projected into the device/glass x,z plane; surface gradients create a shallow-water-like restoring force. A simple damped velocity field advects volume between neighboring cells. This gives tilt/slosh response from real `g_eff` without simulating individual grains.
- **Neck flow**: volume transfers from the upstream bulb to the downstream bulb at `Q = Q0 * factor`, where `Q0 = totalVolume / duration`. In physical mode, transfer is gated by gravity direction/magnitude; in strict mode, it is forced.
- **Rendering**: two deformed mesh surfaces (one per bulb), updated in `useFrame` by mutating plane geometry vertices. No per-grain instances, no particle system, no postprocessing. Glass is a lathe with cheap physical-style material; frame is simple primitives.
- **Sensor emphasis**: `g_eff = -(accelerationIncludingGravity)`, low-pass filtered in `src/sensors/gravity.ts`, fed every frame to the heightfield step. Slosh acceleration uses projected gravity so tilting the device moves the sand surface.
- **Performance**: fixed small grid (1024 cells/bulb), typed arrays, no allocations in the steady-state step, one mesh per bulb. Intended to be smooth on mid-range phones; **not yet measured on-device in this environment**.

### Tradeoffs / deviations

- **Not the spec PBD granular solver**. No per-grain contacts, no Coulomb grain-grain friction, no repose angle emergence from grains, no capture-region grain selection. Sand behavior is an efficient approximation inspired by heightfield/shallow-water/liquid surface techniques (similar in spirit to how simple beverage-slosh apps avoid particle fluids).
- **No R1 depth-imposter surface**. The redesign uses mesh surfaces for speed/simplicity.
- **Acceptance criteria not fully met**. The old sim tests that asserted grain-level behavior were replaced with heightfield invariant tests (conservation, drain direction, tilt reduces flow, flip reverses upstream, strict mode). The full spec acceptance suite (exact drain/repose/flip/shake/sleep tolerances, 10-min soak, background resume rebuild) is not verified.
- **Visual fidelity**: sand reads as a smooth volume/surface, not individual grains. This matches the user's request but is a stylized approximation.
- **Background/resume fast-forward**: not fully implemented.

## Milestone 1 - Scaffold

- Created a new Expo app in `sensor-hourglass/` using Bun. `bun.lock` is committed; no npm/yarn lockfiles.
- Portrait locked via `expo-screen-orientation`. Background/splash clear color `#0F1611`.
- Fonts: Pixelify Sans (UI) and IBM Plex Mono (numerals/hex). Splash held until fonts load.

## Sensor mapping

- Expo DeviceMotion `accelerationIncludingGravity` (m/s²), mapped by negation to `g_eff` in device frame.
- Platform-specific empirical verification is required on-device with the debug/visual behavior: flat face-up, upright portrait, upside down, tilt. Adjust sign/convention in `src/sensors/gravity.ts` if needed.

## Runtime fixes

- **Hermes startup crash**: `three.cjs` called `process.emitWarning`, unavailable on Hermes, causing `[runtime not ready]: TypeError: undefined is not a function`. Fixed by guarding the call and adding `scripts/patch-three.js` as `postinstall`.
- **Babel config**: removed manual `react-native-reanimated/plugin`; `babel-preset-expo` handles Reanimated/Worklets for SDK 58.

## Tests / verification

- Automated: `bun test src/sim/sim.test.ts` passes (5 tests: conservation, upright drain, horizontal tilt low flow, flip upstream reversal, strict mode flow).
- `bun run typecheck` and `bun run lint` pass.
- **Not verified in this workspace**: real-device Expo Go Android/iOS, actual FPS/smoothness, sensor axis empirical check, haptic quality, thermal/10-min soak, background resume, visual quality.

## Known gaps

- R1 depth-imposter + bilateral blur not implemented.
- Full spec granular acceptance tolerances not met; heightfield is an approximation.
- Quality governor/startup micro-benchmark minimal.
- Sensor recorder/replay has module-level code; no in-app debug UI.
- Stream ribbon/dust visual not implemented.
- Old grain/solver files remain in `src/sim/` but are not on the active path.
