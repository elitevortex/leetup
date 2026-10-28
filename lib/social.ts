import AsyncStorage from '@react-native-async-storage/async-storage';

// Posts someone hid from their own feed live on this device only
const HIDDEN_KEY = 'leetup.hiddenSolves';

export async function getHiddenSolves(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function hideSolve(id: string) {
  const hidden = await getHiddenSolves();
  hidden.add(id);
  await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
}

// "use a `Map` here" -> [{ text: 'use a ' }, { text: 'Map', code: true }, { text: ' here' }]
export function splitCode(text: string): { text: string; code?: boolean }[] {
  return text
    .split(/`([^`\n]+)`/)
    .map((part, i) => (i % 2 === 1 ? { text: part, code: true } : { text: part }))
    .filter((p) => p.text.length > 0);
}
