# Sensor Hourglass

A React Native + Expo (SDK 58) prototype for a sensor-driven, physics-based 3D hourglass. The phone's motion sensors drive sand gravity in the device/glass frame; UI is screen-space and does not rotate.

## Stack

- Bun (`bun install`, `bun run start`)
- Expo SDK 58, React Native 0.88, TypeScript strict
- `three`, `@react-three/fiber/native`, `expo-gl`
- `expo-sensors`, `expo-screen-orientation`, `expo-haptics`
- `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`
- `@react-native-async-storage/async-storage`
- Fonts: `@expo-google-fonts/pixelify-sans`, `@expo-google-fonts/ibm-plex-mono`

## Run

```bash
cd sensor-hourglass
bun install
bun run start      # Expo dev server
bun run android    # Android
bun run ios        # iOS
bun run test       # Bun tests (sim)
bun run lint
bun run typecheck
```

## Project layout

- `src/sim/` - pure TypeScript simulation (no React/three): constants, glass profile, grains, hash, solver, flux, stream, sleep, fill/replay, tests.
- `src/sensors/` - gravity adapter, virtual orientation, recorder.
- `src/scene/` - R3F/native scene: glass, frame, sand instanced renderer.
- `src/ui/` - UI components (settings modal lives in `App.tsx` for this prototype).
- `src/state/` - settings persistence.
- `src/theme/` - colors and editable sand presets.
- `docs/DECISIONS.md` - decisions, deviations, verification notes.

## Physics model

- Real SI units. Hourglass ~18 cm tall, bulbs ~6 cm across.
- Gravity in device frame: `g_eff = -(accelerationIncludingGravity)`, lightly low-pass filtered (30 Hz), clamped to 4g and rate-limited.
- PBD granular solver: typed arrays, uniform spatial hash, Coulomb friction with `mu = tan(34°)`, low restitution, glass SDF/profile collision, sleeping.
- Flux controller meters neck at `Q = Q0 * sqrt(gn/g0)` (physical mode). Strict mode forces `Q0`.
- Grain size is tier-dependent for fixed sand volume (55% bulb fill, packing 0.6).

## Rendering

- **Shipped rung: R2/R3**. Instanced spheres with standard material and analytic normals. R1 depth-imposter + bilateral blur is the target upgrade path.
- Glass: lathe geometry, transparent physical-style material, no transmission.
- Frame: simple dark wood/metal primitives.
- Background/clear color: `#0F1611`.

## Sensor mapping

- Expo DeviceMotion `accelerationIncludingGravity` (m/s²), mapped by negation to `g_eff`.
- Platform-specific empirical verification is required on-device; see `docs/DECISIONS.md`.
- Fallback: virtual orientation buttons (Flip/Shake) and sensor-unavailable notice.

## Quality tiers

|   Tier | Grains | Sim Hz | Substeps |          Rung          | Refraction |
| -----: | -----: | -----: | -------: | :--------------------: | :--------: |
|   High |   4000 |     60 |        3 | R1 target / R2 shipped |    off     |
| Medium |   2500 |     60 |        2 | R1 target / R2 shipped |    off     |
|    Low |   1500 |     30 |        1 |         R2/R3          |    off     |

## Verification status

- Automated: `bun test src/sim/sim.test.ts` passes locally in this workspace.
- Not verified in this workspace: real-device Expo Go run, sensor axis empirical check, FPS/thermal/10-min soak, full spec acceptance tolerances.

## Known deviations

See `docs/DECISIONS.md` for the full list, including simplified capture feeding, R2/R3 rendering rung, and partial background resume.
