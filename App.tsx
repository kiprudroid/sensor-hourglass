import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { DeviceMotion } from 'expo-sensors';
import {
  useFonts,
  PixelifySans_400Regular,
  PixelifySans_700Bold,
} from '@expo-google-fonts/pixelify-sans';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from './src/theme/colors';
import { SAND_PRESETS } from './src/theme/sandPresets';
import {
  loadSettings,
  saveSettings,
  type Settings,
  DEFAULT_SETTINGS,
} from './src/state/settings';
import { createHourglassSim } from './src/sim';
import { createGravityAdapter } from './src/sensors/gravity';
import { createVirtualOrientation } from './src/sensors/virtualOrientation';
import { createSensorRecorder } from './src/sensors/recorder';
import HourglassScene from './src/scene/HourglassScene';

SplashScreen.preventAutoHideAsync().catch(() => {});

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PixelifySans_400Regular,
    PixelifySans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_SETTINGS.durationSeconds);
  const [sensorOk, setSensorOk] = useState(true);
  const [debugGravity, setDebugGravity] = useState({ x: 0, y: -9.80665, z: 0 });
  const simRef = useRef(
    createHourglassSim({
      tier: 'medium',
      durationSeconds: DEFAULT_SETTINGS.durationSeconds,
      seed: 1,
    }),
  );
  const gravityRef = useRef(createGravityAdapter());
  const virtualRef = useRef(createVirtualOrientation());
  const recorderRef = useRef(createSensorRecorder());
  const lastTsRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => {},
    );
  }, []);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      simRef.current = createHourglassSim({
        tier: s.quality === 'auto' ? 'medium' : s.quality,
        durationSeconds: s.durationSeconds,
        seed: 1,
      });
      simRef.current.setTimekeeping(s.timekeeping);
      setRemaining(s.durationSeconds);
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let mounted = true;
    (async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (!mounted) return;
        setSensorOk(available);
        if (!available) return;
        DeviceMotion.setUpdateInterval(16);
        sub = DeviceMotion.addListener((data) => {
          const g = gravityRef.current.update(
            data.accelerationIncludingGravity,
            1 / 60,
            Platform.OS === 'ios'
              ? 'ios'
              : Platform.OS === 'android'
                ? 'android'
                : 'unknown',
          );
          if (recorderRef.current.recording) {
            const accel = data.accelerationIncludingGravity;
            const rate = data.rotationRate;
            const rot = data.rotation;
            const toVec3 = (v: unknown): { x: number; y: number; z: number } => {
              if (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v) {
                const o = v as { x: number; y: number; z: number };
                return { x: Number(o.x), y: Number(o.y), z: Number(o.z) };
              }
              return { x: 0, y: 0, z: 0 };
            };
            recorderRef.current.push({
              t: Date.now(),
              accelerationIncludingGravity: toVec3(accel),
              rotationRate: toVec3(rate),
              rotation: rot
                ? { alpha: rot.alpha, beta: rot.beta, gamma: rot.gamma }
                : { alpha: 0, beta: 0, gamma: 0 },
            });
          }
          setDebugGravity({ x: g.x, y: g.y, z: g.z });
        });
      } catch {
        setSensorOk(false);
      }
    })();
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;
      const g = sensorOk ? gravityRef.current.gravity : virtualRef.current.update(dt);
      if (runningRef.current) {
        simRef.current.step(g, dt);
        const rem = simRef.current.remainingSeconds(g);
        setRemaining(rem);
        if (rem <= 0.05) {
          setRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => {},
          );
        }
      } else {
        // Keep sim settling lightly for visual response.
        simRef.current.step(g, Math.min(dt, 1 / 60));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sensorOk]);

  const onToggleRun = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setRunning((r) => !r);
  }, []);

  const onReset = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setRunning(false);
    simRef.current.reset(settingsRef.current.durationSeconds);
    setRemaining(settingsRef.current.durationSeconds);
  }, []);

  const onVirtualFlip = useCallback(() => {
    virtualRef.current.triggerFlip();
    if (sensorOk) {
      // Also apply to sim by inverting virtual gravity impulse conceptually: toggle running not needed.
    }
  }, [sensorOk]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      if (
        patch.durationSeconds !== undefined &&
        patch.durationSeconds !== prev.durationSeconds
      ) {
        simRef.current.reset(next.durationSeconds);
        setRemaining(next.durationSeconds);
        setRunning(false);
      }
      if (patch.timekeeping) simRef.current.setTimekeeping(next.timekeeping);
      return next;
    });
  }, []);

  if (!fontsLoaded) return <View style={styles.loading} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="light" />
          <HourglassScene
            simRef={simRef}
            gravityRef={gravityRef}
            virtualRef={virtualRef}
            sandColor={settings.sandColor}
            sensorOk={sensorOk}
          />
          <SafeAreaView style={styles.overlay} pointerEvents="box-none">
            <View style={styles.topRow}>
              <View>
                <Text style={styles.title}>HOURGLASS</Text>
                <Text style={styles.time}>{formatTime(remaining)}</Text>
                <Text style={styles.label}>{running ? 'FLOWING' : 'PAUSED'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSettingsOpen(true)}
                style={styles.gearBtn}
              >
                <Text style={styles.gear}>⚙</Text>
              </Pressable>
            </View>
            {!sensorOk && (
              <Text style={styles.notice}>
                Sensors unavailable. Drag to tilt, use Flip/Shake.
              </Text>
            )}
            <View style={styles.bottomRow}>
              <Pressable style={styles.btn} onPress={onToggleRun}>
                <Text style={styles.btnText}>{running ? 'PAUSE' : 'START'}</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={onReset}>
                <Text style={styles.btnText}>RESET</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={onVirtualFlip}>
                <Text style={styles.btnText}>FLIP</Text>
              </Pressable>
              {!sensorOk && (
                <Pressable
                  style={styles.btn}
                  onPress={() => virtualRef.current.triggerShake()}
                >
                  <Text style={styles.btnText}>SHAKE</Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
          <SettingsModal
            open={settingsOpen}
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onChange={updateSettings}
          />
          <Text
            style={styles.debug}
          >{`g ${debugGravity.x.toFixed(2)} ${debugGravity.y.toFixed(2)} ${debugGravity.z.toFixed(2)}`}</Text>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function SettingsModal({
  open,
  settings,
  onClose,
  onChange,
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (p: Partial<Settings>) => void;
}) {
  const [hex, setHex] = useState(settings.sandColor);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input when modal opens
      setHex(settings.sandColor);
    }
  }, [open, settings.sandColor]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>SETTINGS</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>X</Text>
            </Pressable>
          </View>
          <Text style={styles.section}>DURATION</Text>
          <View style={styles.presetRow}>
            {[30, 60, 300, 600, 1500].map((s) => (
              <Pressable
                key={s}
                style={[
                  styles.preset,
                  settings.durationSeconds === s && styles.presetActive,
                ]}
                onPress={() => onChange({ durationSeconds: s })}
              >
                <Text style={styles.presetText}>
                  {s < 60 ? `${s}s` : `${Math.round(s / 60)}m`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.section}>SAND COLOR</Text>
          <View style={styles.presetRow}>
            {SAND_PRESETS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  settings.sandColor === c && styles.swatchActive,
                ]}
                onPress={() => onChange({ sandColor: c })}
              />
            ))}
          </View>
          <View style={styles.hexRow}>
            <TextInput
              value={hex}
              onChangeText={setHex}
              style={styles.hexInput}
              autoCapitalize="characters"
            />
            <Pressable
              style={styles.applyBtn}
              onPress={() =>
                /^#[0-9A-Fa-f]{6}$/.test(hex) && onChange({ sandColor: hex })
              }
            >
              <Text style={styles.btnText}>APPLY</Text>
            </Pressable>
          </View>
          <Text style={styles.section}>ADVANCED</Text>
          <View style={styles.presetRow}>
            {(['physical', 'strict'] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.preset, settings.timekeeping === m && styles.presetActive]}
                onPress={() => onChange({ timekeeping: m })}
              >
                <Text style={styles.presetText}>{m.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', padding: 16 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    color: COLORS.text,
    fontFamily: 'PixelifySans_700Bold',
    fontSize: 20,
    letterSpacing: 2,
  },
  time: {
    color: COLORS.text,
    fontFamily: 'IBMPlexMono_600SemiBold',
    fontSize: 42,
    marginTop: 8,
  },
  label: {
    color: COLORS.muted,
    fontFamily: 'PixelifySans_400Regular',
    fontSize: 14,
    marginTop: 4,
  },
  gearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    backgroundColor: '#182019cc',
  },
  gear: { color: COLORS.text, fontSize: 22 },
  notice: {
    color: COLORS.accent,
    fontFamily: 'PixelifySans_400Regular',
    fontSize: 12,
    padding: 8,
    backgroundColor: '#182019cc',
  },
  bottomRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    backgroundColor: '#182019dd',
    minWidth: 72,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.text,
    fontFamily: 'PixelifySans_400Regular',
    fontSize: 12,
    letterSpacing: 1,
  },
  scrim: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 20 },
  modal: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.panelBorder,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { color: COLORS.text, fontFamily: 'PixelifySans_700Bold', fontSize: 20 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: COLORS.text, fontFamily: 'PixelifySans_700Bold', fontSize: 18 },
  section: {
    color: COLORS.muted,
    fontFamily: 'PixelifySans_400Regular',
    fontSize: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  presetActive: { borderColor: COLORS.accent, backgroundColor: '#2A352C' },
  presetText: { color: COLORS.text, fontFamily: 'IBMPlexMono_400Regular', fontSize: 12 },
  swatch: { width: 34, height: 34, borderWidth: 1, borderColor: COLORS.panelBorder },
  swatchActive: { borderColor: COLORS.text, borderWidth: 2 },
  hexRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  hexInput: {
    flex: 1,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    paddingHorizontal: 10,
    fontFamily: 'IBMPlexMono_400Regular',
  },
  applyBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  debug: {
    position: 'absolute',
    bottom: 4,
    left: 8,
    color: '#93A08F88',
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 10,
  },
});
