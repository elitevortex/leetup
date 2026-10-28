import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
} from '@expo-google-fonts/geist-mono';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { Colors } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

// Sends people to the right step for their account state, wherever they are
function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments() as string[];

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    const screen = segments[1];
    if (status === 'signedOut' && group !== '(auth)') router.replace('/(auth)/login');
    else if (status === 'needsProfile' && !(group === '(onboarding)' && screen === 'setup')) router.replace('/(onboarding)/setup');
    else if (status === 'needsLeetCode' && !(group === '(onboarding)' && screen === 'connect')) router.replace('/(onboarding)/connect');
    else if (status === 'ready' && (group === '(auth)' || group === '(onboarding)' || group === undefined)) router.replace('/(tabs)');
  }, [status, segments]);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
    GeistMono_700Bold,
  });

  // Hold the splash until fonts are ready so text never flashes in the system face
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <AuthProvider>
        <StatusBar style="light" />
        <AuthGate />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
          <Stack.Screen name="timer" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="post" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
          <Stack.Screen name="celebrate" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="media/[solveId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="report" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
