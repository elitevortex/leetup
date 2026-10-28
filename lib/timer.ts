import AsyncStorage from '@react-native-async-storage/async-storage';

// A running solve survives the app being closed: it's stored, not held in memory
export interface TimerState {
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
}

const KEY = 'leetup.timer';

export async function loadTimer(): Promise<TimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

export async function saveTimer(state: TimerState | null) {
  if (state) await AsyncStorage.setItem(KEY, JSON.stringify(state));
  else await AsyncStorage.removeItem(KEY);
}

export function activeMs(state: TimerState, now = Date.now()): number {
  const paused = state.pausedMs + (state.pausedAt ? now - state.pausedAt : 0);
  return Math.max(0, now - state.startedAt - paused);
}
