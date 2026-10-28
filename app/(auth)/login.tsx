import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Code, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { Button, Glow, Screen, T, Wordmark } from '../../components/ui';

const APPLE = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
const GOOGLE = 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z';

function BrandIcon({ d, color, size }: { d: string; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} />
    </Svg>
  );
}

const STEPS = ['Sign in with Apple or Google', 'Connect your LeetCode username', 'Verify it’s yours: paste a code in your bio'];

export default function Login() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const run = async (which: 'apple' | 'google', fn: () => Promise<void>) => {
    setError(null);
    setBusy(which);
    try {
      await fn();
    } catch (e: any) {
      // Closing the Apple sheet isn't an error worth showing
      if (e?.code !== 'ERR_REQUEST_CANCELED') setError(e?.message ?? 'Sign-in didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Glow style={{ top: 20 }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}>
          <T style={{ fontFamily: Fonts.monoBold, fontSize: 32, letterSpacing: -2 }} color={Colors.accentInk}>{'>_'}</T>
        </View>
        <Wordmark size={36} />
        <T variant="mono" color={Colors.text3} style={{ fontSize: 14 }}>// your leetcode, but social.</T>

        <View style={styles.how}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Code size={16} color={Colors.accent} />
            <T variant="name" style={{ fontSize: 14 }}>Built on your LeetCode account</T>
          </View>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.num}>
                <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 11 }} color={Colors.text2}>{i + 1}</T>
              </View>
              <T variant="bodySm">{s}</T>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        {error ? <T variant="bodySm" color={Colors.hard} style={{ textAlign: 'center' }}>{error}</T> : null}
        {appleAvailable ? (
          <Button
            title="Continue with Apple"
            variant="light"
            loading={busy === 'apple'}
            onPress={() => run('apple', signInWithApple)}
            icon={(c) => <BrandIcon d={APPLE} color={c} size={18} />}
          />
        ) : null}
        <Button
          title="Continue with Google"
          variant="secondary"
          loading={busy === 'google'}
          onPress={() => run('google', signInWithGoogle)}
          icon={(c) => <BrandIcon d={GOOGLE} color={c} size={17} />}
        />
        <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/email')} style={styles.email} hitSlop={8}>
          <Mail size={14} color={Colors.text3} />
          <T variant="monoMedium" color={Colors.text3}>use email instead</T>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <T variant="monoSm">no LeetCode account?</T>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://leetcode.com/accounts/signup/')}>
            <T variant="monoSm" color={Colors.accent}>create one free ↗</T>
          </Pressable>
        </View>
        <T variant="bodySm" style={{ textAlign: 'center', fontSize: 11, lineHeight: 16, color: Colors.text3, maxWidth: 300 }}>
          By continuing you agree to the Terms of Use and Privacy Policy. We never ask for your LeetCode password.
        </T>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  icon: { width: 76, height: 76, borderRadius: 20, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  how: { alignSelf: 'stretch', gap: 12, padding: 16, marginTop: 14, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  num: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderStrong },
  email: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
});
