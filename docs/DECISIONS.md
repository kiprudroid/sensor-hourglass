# Decisions

## Environment & scope

- **Date**: 2026-11-24
- **Stack**: Expo SDK 58.0.26, React Native 0.88.1, React 19.3.0, Three 0.187.0, `@react-three/fiber` 9.8.2, `expo-gl` 58.0.4, Bun 1.4.4.
- **No WASM**: Simulation is pure TypeScript typed arrays.

## Milestone 1 - Scaffold

- Created a new Expo app in `sensor-hourglass/` using Bun. `bun.lock` is committed; no npm/yarn lockfiles.
- Portrait locked via `expo-screen-orientation`. Background/splash clear color `#0F1611`.
- Fonts: Pixelify Sans (UI) and IBM Plex Mono (numerals/hex). Splash held until fonts load.

## Milestone 2 - Feasibility spike (recorded as static/dev estimate)

- **Not run on physical devices in this CI-less workspace**. I could not verify Expo Go on real Android/iOS hardware here.
- Selected conservative starting tiers based on typical R3F/expo-gl mobile budgets:
  - High: 4000 grains, R2 instanced spheres, render scale 1, refraction off (cheap fake not implemented), blur 0.
  - Medium: 2500 grains, R2, render scale 0.75.
  - Low: 1500 grains, R2/R3, render scale 0.6.
- **Rendering rung shipped: R2/R3-style instanced sphere sprites** (MeshStandardMaterial instanced spheres with analytic normals). Full R1 depth-imposter+bilateral blur surface was not implemented due environment/time; the code structure keeps rendering behind `src/scene/*` so R1 can replace SandPoints.
- Sensor axis mapping is implemented as `g_eff = -(accelerationIncludingGravity)` in Expo device coordinates (x right, y up, z out of screen). This is the expected Expo DeviceMotion convention; **must be empirically verified on-device** with the debug overlay (flat face-up, upright, upside down) and updated in `src/sensors/gravity.ts`.

## Physics model

- PBD-style granular solver with spatial hash, grain-grain Coulomb friction (`mu=tan(34°)`), glass friction, restitution 0.04, sleeping, and glass interior collision against an axisymmetric radius-vs-height profile table.
- Grain size is derived from selected tier count and fixed sand volume (55% of one bulb at packing fraction 0.6).
- Flux controller meters neck transfer at `Q = Q0 * sqrt(gn/g0)` in physical mode; strict mode forces `Q0` regardless of orientation.
- **Deviation**: capture selection falls back to the lowest upstream grain when no grain is in the narrow capture band. This keeps flow functioning with the coarse JS solver but relaxes the literal "only grains physically present in the capture region" constraint. Documented as a solver-feeding approximation.
- Stream is modeled as in-flight bulb=2 grains with impact reintroduction; visual stream thread is simplified in scene (not a full tapered ribbon with dust).
- Background fast-forward rebuild is not fully implemented; snapshot/settings persistence is implemented.

## Timing

- Remaining time is `upstream grains / Q0` (physical) or same counter in strict mode with forced Q.
- Supported duration UI presets 30s-25m; custom input clamps to 10s-24h.

## Look & performance

- Background and clear color are exactly `#0F1611`.
- Sand color is user-defined, no hardcoded sand render constant; presets live in `src/theme/sandPresets.ts`.
- Instanced mesh rendering, no postprocessing libraries, no heavy drei helpers.
- No runtime shadow maps on shipped tiers.

## Tests / verification

- `bun test src/sim/sim.test.ts` passes in this environment. Tests cover conservation, repose sanity, drain transfer, tilt near-zero flow, flip upstream reversal, shake containment, strict-mode flow, replay determinism.
- **Not verified here**: Expo Go on real Android/iOS, actual fps/ms-per-step on target devices, depth-imposter R1, haptic quality, thermal 10-min soak, background resume visual rebuild.

## Known gaps / deviations

- R1 depth-imposter + bilateral blur surface not shipped; R2/R3 instanced spheres shipped.
- Stream ribbon/dust visual is simplified.
- Full acceptance suite from spec (exact 2% drain, 34°±4° repose, sqrt(cos45)±5%, 40% flip reversal±3%, 90% sleep in 3s, strict wall-clock exact) is not fully met by this simplified JS solver; core invariants are tested.
- Quality governor and startup micro-benchmark are minimal/not fully adaptive.
- Sensor recorder/replay tooling exists at module level; no in-app debug UI.
- Background resume fast-forward/rebuild is partial.
