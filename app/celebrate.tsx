import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { fetchTeasers } from '../lib/api';
import { formatDuration } from '../lib/format';
import { Button, Glow, Screen, T } from '../components/ui';

// "Accepted": the post-solve celebration. A terminal types the post command, the testcases
// pass one by one, the verdict lands, then your stats and the unlock. Tap anywhere to skip.

const TESTCASES = 22;
const TYPE_MS = 28;

function haptic(kind: 'tick' | 'success') {
  if (Platform.OS === 'web') return;
  if (kind === 'tick') Haptics.selectionAsync().catch(() => undefined);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

function Testcase({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const on = interpolate(progress.value, [index, index + 1], [0, 1], 'clamp');
    return {
      opacity: 0.25 + on * 0.75,
      transform: [{ scale: 0.6 + on * 0.4 }],
      backgroundColor: on > 0.5 ? Colors.accent : Colors.surface2,
    };
  });
  return <Animated.View style={[styles.testcase, style]} />;
}

export default function Celebrate() {
  const { userId } = useAuth();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ num?: string; title?: string; difficulty?: string; time?: string; points?: string }>();
  const command = `leetup post ${params.num ?? ''}`.trim();

  const [typed, setTyped] = useState(reduced ? command.length : 0);
  const [streak, setStreak] = useState<number | null>(null);
  const [friends, setFriends] = useState(0);
  const cases = useSharedValue(reduced ? TESTCASES : 0);
  const verdict = useSharedValue(reduced ? 1 : 0);
  const stats = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!userId) return;
    supabase.rpc('leetup_streak', { uid: userId }).then(({ data }) => setStreak(typeof data === 'number' ? data : null));
    fetchTeasers().then((t) => setFriends(new Set(t.filter((x) => x.user_id !== userId).map((x) => x.user_id)).size)).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (reduced) {
      haptic('success');
      return;
    }
    // 1. type the command, 2. testcases fill, 3. verdict springs in, 4. stats rise
    const typing = setInterval(() => setTyped((n) => (n >= command.length ? n : n + 1)), TYPE_MS);
    const typeDone = command.length * TYPE_MS + 150;
    cases.value = withDelay(typeDone, withTiming(TESTCASES, { duration: 650, easing: Easing.linear }));
    const ticks = setInterval(() => haptic('tick'), 90);
    const stopTicks = setTimeout(() => clearInterval(ticks), typeDone + 650);
    verdict.value = withDelay(typeDone + 700, withSpring(1, { damping: 12, stiffness: 140 }));
    stats.value = withDelay(typeDone + 1100, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    const success = setTimeout(() => haptic('success'), typeDone + 700);
    return () => {
      clearInterval(typing);
      clearInterval(ticks);
      clearTimeout(stopTicks);
      clearTimeout(success);
    };
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    setTyped(command.length);
    cases.value = TESTCASES;
    verdict.value = 1;
    stats.value = 1;
  };

  const verdictStyle = useAnimatedStyle(() => ({
    opacity: verdict.value,
    transform: [{ scale: interpolate(verdict.value, [0, 1], [1.35, 1]) }],
  }));
  const statsStyle = useAnimatedStyle(() => ({
    opacity: stats.value,
    transform: [{ translateY: interpolate(stats.value, [0, 1], [24, 0]) }],
  }));

  const goHome = () => {
    router.dismissAll();
    router.replace('/(tabs)');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable style={{ flex: 1 }} onPress={skip} accessibilityLabel="Accepted. Your solve is posted." accessible={false}>
        <Glow size={420} style={{ top: 120 }} />
        <View style={styles.body}>
          <View style={styles.terminal}>
            <T style={styles.prompt}>
              <T style={styles.prompt} color={Colors.accent}>~/ </T>
              {command.slice(0, typed)}
              {typed < command.length ? <T color={Colors.accent}>█</T> : null}
            </T>
            <View style={styles.cases} accessibilityElementsHidden>
              {Array.from({ length: TESTCASES }).map((_, i) => (
                <Testcase key={i} index={i} progress={cases} />
              ))}
            </View>
            <T variant="monoSm">{`${TESTCASES} / ${TESTCASES} testcases passed`}</T>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: 6 }, verdictStyle]}>
            <T style={styles.verdict} color={Colors.accent} accessibilityRole="header">Accepted</T>
            <T variant="medium" style={{ textAlign: 'center' }}>
              #{params.num} {params.title}
            </T>
          </Animated.View>

          <Animated.View style={[{ gap: 14, alignSelf: 'stretch' }, statsStyle]}>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <T variant="bigStat">{params.time ? formatDuration(Number(params.time)) : '—'}</T>
                <T variant="label">time</T>
              </View>
              <View style={styles.stat}>
                <T variant="bigStat" color={Colors.accent}>{params.points ?? '+0'}</T>
                <T variant="label">points</T>
              </View>
              <View style={styles.stat}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <T variant="bigStat">{streak ?? '–'}</T>
                  <Flame size={18} color={Colors.medium} />
                </View>
                <T variant="label">day streak</T>
              </View>
            </View>
            <View style={styles.unlock}>
              <T variant="monoMedium" style={{ fontSize: 12, textAlign: 'center' }}>
                {friends > 0
                  ? `home unlocked · ${friends} ${friends === 1 ? 'friend' : 'friends'} solved today`
                  : 'home unlocked · you’re first today'}
              </T>
            </View>
            <Button title="See today’s solves →" onPress={goHome} />
          </Animated.View>
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
  terminal: { alignSelf: 'stretch', gap: 14, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  prompt: { fontFamily: Fonts.monoMedium, fontSize: 15, color: Colors.text },
  cases: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  testcase: { width: 18, height: 18, borderRadius: 4 },
  verdict: { fontFamily: Fonts.monoBold, fontSize: 52, lineHeight: 62, letterSpacing: -2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 6, padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  unlock: { padding: 12, borderRadius: Radius.md, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
});
