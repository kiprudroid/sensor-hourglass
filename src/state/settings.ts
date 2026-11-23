import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SAND_COLOR } from '../theme/colors';
import type { QualityTier, TimekeepingMode } from '../sim/types';

export interface Settings {
  durationSeconds: number;
  sandColor: string;
  timekeeping: TimekeepingMode;
  quality: QualityTier | 'auto';
}

const KEY = 'sensor-hourglass:settings:v1';

export const DEFAULT_SETTINGS: Settings = {
  durationSeconds: 60,
  sandColor: DEFAULT_SAND_COLOR,
  timekeeping: 'physical',
  quality: 'auto',
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
