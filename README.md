# Sensor Hourglass

A React Native + Expo (SDK 58) sensor-driven 3D hourglass. The phone's motion sensors drive sand gravity in the device/glass frame; sand sloshes and drains according to projected gravity. UI is screen-space and does not rotate.

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
bun run start      # Expo dev server (use --clear after pulling major changes)
bun run android    # Android
bun run ios        # iOS
bun run test       # Bun tests (sim)
bun run lint
bun run typecheck
```

For Android runtime/module fixes after pulling:

```bash
git pull
bun install
bunx expo start --clear
```

## Project layout

- `src/sim/heightfield.ts` - active sand simulation: 32x32 heightfield per bulb, shallow-water-like slosh, neck volume transfer.
- `src/sim/index.ts` - sim public API used by the app.
- `src/sim/*.ts` - legacy grain/PBD files retained but not on the active path.
- `src/sensors/` - gravity adapter, virtual orientation, recorder.
- `src/scene/` - R3F/native scene: glass, frame, deformed sand surface meshes.
- `src/ui/` - UI components.
- `src/state/` - settings persistence.
- `src/theme/` - colors and editable sand presets.
- `docs/DECISIONS.md` - decisions, deviations, verification notes.

## Physics model (heightfield redesign)

- **No per-particle sand rendering/sim**. Individual grains were too expensive on mobile and did not read as sand.
- **Heightfield surface**: each bulb has a 32x32 grid storing sand volume. Gravity is projected into the device x,z plane to drive slosh; height gradients produce restoring flow. Velocities are damped for stable, smooth motion.
- **Gravity**: `g_eff = -(accelerationIncludingGravity)` from Expo DeviceMotion, low-pass filtered (~30 Hz), clamped. This drives both slosh direction and neck drain direction.
- **Neck flow**: volume transfers from upstream to downstream bulb at `Q0 = totalVolume / duration`, gated by gravity in physical mode; strict mode forces flow.
- **Newtonian intent**: tilting should move the surface toward the downhill side; flipping reverses upstream/downstream; low-g reduces flow. This is an efficient approximation, not a full granular/particle-fluid solver.

## Rendering

- **Shipped**: two deformed meshes (upper/lower sand surfaces), updated each frame from heightfield data; glass lathe; simple frame; no postprocessing.
- **Background/clear color**: `#0F1611`.
- **Sand color**: user-defined via presets/custom picker.

## Sensor mapping

- Expo DeviceMotion `accelerationIncludingGravity` (m/s²), negated to `g_eff`.
- Fallback: virtual orientation controls when sensors are unavailable.
- **Needs on-device empirical verification** (flat, upright, upside down, tilt) and sign tweaks in `src/sensors/gravity.ts` if any axis is inverted.

## Verification status

- Automated: `bun test src/sim/sim.test.ts` passes (5 tests). `bun run typecheck` and `bun run lint` pass.
- **Not verified in this workspace**: real-device Expo Go Android/iOS, actual FPS/smoothness, sensor feel/axis correctness, haptics, 10-min soak, background resume, full visual quality.

## Known deviations

- Replaced spec PBD grain solver with heightfield approximation for mobile performance.
- No R1 depth-imposter/bilateral blur surface.
- Full spec acceptance tolerances not met/verified.
- Legacy grain/solver files remain but are inactive.
- See `docs/DECISIONS.md` for details.
