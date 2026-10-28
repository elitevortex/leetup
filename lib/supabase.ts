import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!envUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.');
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

// In development a local Supabase lives on the same machine as the Expo server, so point at
// whatever address the device reached Expo on; the Mac's LAN IP changes between networks.
function resolveUrl(url: string): string {
  const devHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(':')[0] : undefined;
  const parsed = new URL(url);
  if (!devHost || !LOCAL_HOST.test(devHost) || !LOCAL_HOST.test(parsed.hostname)) return url;
  parsed.hostname = devHost;
  return parsed.toString().replace(/\/$/, '');
}

const supabaseUrl = resolveUrl(envUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE lets the OAuth redirect hand back a code we exchange in-app
    flowType: 'pkce',
  },
});
