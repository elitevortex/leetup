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

export { splitCode } from './mentions';
