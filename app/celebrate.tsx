import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Crown, Flame, LockOpen, Trophy, Zap } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { fetchCelebration } from '../lib/api';
import { formatDuration } from '../lib/format';
import { Celebration, Difficulty } from '../types';
import { Avatar, Button, T } from '../components/ui';

// "Takeover": a green flood with a burst of code glyphs, a hard cut to black, "Accepted" with
// the word getting "selected" like code in an editor, then the payoff. The first solve of the day pays off with the unlock;
// later solves pay off with one progress highlight. Tap anywhere to skip to the end.

const CUT_MS = 950;
const GLYPHS = ['{ }', '</>', '>_', '( )', '[ ]', ';', '=>', 'O(1)', '&&', '++', '#', '//'];
const BURST: Record<Difficulty, number> = { Easy: 10, Medium: 16, Hard: 24 };
const MILESTONES = new Set([10, 25, 50, 100, 250, 500, 1000]);

function haptic(kind: 'heavy' | 'success' | 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  else if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

function ordinal(n: number) {
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 13) return `${n}th`;
  const r10 = n % 10;
  return `${n}${r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th'}`;
}

function Glyph({ char, angle, radius, size, burst }: { char: string; angle: number; radius: number; size: number; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    const out = 1 - Math.pow(1 - p, 3);
    return {
      opacity: interpolate(p, [0, 0.12, 0.8, 1], [0, 1, 1, 0.6]),
      transform: [
        { translateX: Math.cos(angle + p * 0.9) * radius * out },
        { translateY: Math.sin(angle + p * 0.9) * radius * out },
        { rotate: `${(angle + p * 1.6) * 57.3}deg` },
        { scale: 0.6 + out * 0.6 },
      ],
    };
  });
  return (
    <Animated.Text style={[styles.glyph, { fontSize: size }, style]} accessibilityElementsHidden>
      {char}
    </Animated.Text>
  );
}

// Old number rolls up and out, new number rolls in
function Odometer({ from, to, progress }: { from: number; to: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -progress.value * 30 }] }));
  return (
    <View style={{ height: 30, overflow: 'hidden' }}>
      <Animated.View style={style}>
        <T style={styles.odo}>{from}</T>
        <T style={styles.odo}>{to}</T>
      </Animated.View>
    </View>
  );
}

function PopIn({ index, progress, children }: { index: number; progress: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [index * 0.12, index * 0.12 + 0.4], [0, 1], 'clamp');
    return { opacity: p, transform: [{ scale: 0.4 + p * 0.6 }] };
  });
  return <Animated.View style={[{ marginLeft: index === 0 ? 0 : -8 }, style]}>{children}</Animated.View>;
}

function highlight(c: Celebration): { icon: 'trophy' | 'crown' | 'zap' | 'flame'; title: string; body: string } {
  if (MILESTONES.has(c.total_solves)) return { icon: 'trophy', title: `${ordinal(c.total_solves)} solve`, body: 'a milestone. keep stacking.' };
  if (c.passed.length > 0) {
    const others = c.passed.length > 1 ? ` +${c.passed.length - 1}` : '';
    return { icon: 'crown', title: `you passed ${c.passed[0]}${others}`, body: `#${c.rank_after} of ${c.board_size} this week` };
  }
  if (c.personal_best && c.time_seconds != null && c.previous_best != null) {
    return { icon: 'zap', title: `fastest ${c.difficulty.toLowerCase()} yet`, body: `beat your ${formatDuration(c.previous_best)} by ${formatDuration(c.previous_best - c.time_seconds)}` };
  }
  return { icon: 'flame', title: `solve #${c.solves_today} today`, body: `${c.week_points} pts this week · #${c.rank_after} of ${c.board_size}` };
}

const ICONS = { trophy: Trophy, crown: Crown, zap: Zap, flame: Flame };

export default function Celebrate() {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ solveId?: string; num?: string; title?: string; difficulty?: Difficulty; points?: string }>();
  const difficulty: Difficulty = params.difficulty ?? 'Medium';
  const [data, setData] = useState<Celebration | null>(null);
  const [done, setDone] = useState(reduced);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flood = useSharedValue(reduced ? 1 : 0);
  const burst = useSharedValue(reduced ? 1 : 0);
  const cut = useSharedValue(reduced ? 1 : 0);
  const title = useSharedValue(reduced ? 1 : 0);
  // Selection: line highlight, then a block sweeping behind the word, then a blinking cursor
  const line = useSharedValue(reduced ? 1 : 0);
  const select = useSharedValue(reduced ? 1 : 0);
  const blink = useSharedValue(1);
  const [wordWidth, setWordWidth] = useState(0);
  const payoff = useSharedValue(reduced ? 1 : 0);
  const extras = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (params.solveId) fetchCelebration(params.solveId).then(setData).catch(() => undefined);
  }, [params.solveId]);

  useEffect(() => {
    if (reduced) {
      haptic('success');
      return;
    }
    haptic('heavy');
    flood.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    burst.value = withDelay(80, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    cut.value = withDelay(CUT_MS, withTiming(1, { duration: 0 }));
    title.value = withDelay(CUT_MS + 40, withSpring(1, { damping: 14, stiffness: 160 }));
    line.value = withDelay(CUT_MS + 40, withTiming(1, { duration: 200 }));
    select.value = withDelay(CUT_MS + 230, withTiming(1, { duration: 380, easing: Easing.inOut(Easing.cubic) }));
    // Hard on/off like a terminal cursor, starting once the selection lands
    blink.value = withDelay(
      CUT_MS + 700,
      withRepeat(withSequence(withTiming(1, { duration: 550 }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 550 }), withTiming(1, { duration: 0 })), -1),
    );
    payoff.value = withDelay(CUT_MS + 520, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    extras.value = withDelay(CUT_MS + 820, withTiming(1, { duration: 900 }));
    timers.current = [
      setTimeout(() => haptic('success'), CUT_MS),
      setTimeout(() => haptic('light'), CUT_MS + 900),
      setTimeout(() => setDone(true), CUT_MS + 900),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    if (done) return;
    timers.current.forEach(clearTimeout);
    [flood, burst, cut, title, line, select, payoff, extras].forEach((v) => (v.value = 1));
    setDone(true);
  };

  const diameter = Math.hypot(width, height) * 1.15;
  const floodStyle = useAnimatedStyle(() => ({
    opacity: cut.value ? 0 : 1,
    transform: [{ scale: flood.value }],
  }));
  const floodContent = useAnimatedStyle(() => ({ opacity: cut.value ? 0 : 1 }));
  const pointsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.15, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(burst.value, [0, 0.25, 1], [0.4, 1.08, 1]) }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    letterSpacing: interpolate(title.value, [0, 1], [6, -2]),
    transform: [{ translateY: interpolate(title.value, [0, 1], [30, 0]) }],
  }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.value }));
  const blockStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: select.value }] }));
  // The word turns from white to ink as the block passes the middle of it
  const wordColor = useAnimatedStyle(() => ({ color: interpolateColor(select.value, [0, 0.55, 1], [Colors.text, Colors.text, Colors.accentInk]) }));
  const caretStyle = useAnimatedStyle(() => ({
    opacity: interpolate(select.value, [0, 0.05], [0, 1], 'clamp') * blink.value,
    transform: [{ translateX: (select.value - 1) * (wordWidth + 22) }],
  }));
  const payoffStyle = useAnimatedStyle(() => ({ opacity: payoff.value, transform: [{ translateY: interpolate(payoff.value, [0, 1], [24, 0]) }] }));

  const glyphs = useMemo(() => {
    const n = BURST[difficulty];
    return Array.from({ length: n }).map((_, i) => ({
      char: GLYPHS[i % GLYPHS.length],
      angle: (i / n) * Math.PI * 2 + (i % 3) * 0.3,
      radius: Math.min(width, height) * (0.32 + (i % 4) * 0.07),
      size: 18 + (i % 3) * 8,
    }));
  }, [difficulty, width, height]);

  const goHome = () => {
    router.dismissAll();
    router.replace('/(tabs)');
  };

  const pts = params.points ?? (data ? `+${data.points}` : '');
  const h = data && !data.first_today ? highlight(data) : null;
  const HIcon = h ? ICONS[h.icon] : null;

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessible={false} />

      {/* Takeover */}
      <Animated.View pointerEvents="none" style={[styles.flood, { width: diameter, height: diameter, borderRadius: diameter / 2, left: (width - diameter) / 2, top: (height - diameter) / 2 }, floodStyle]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, floodContent]}>
        {glyphs.map((g, i) => (
          <Glyph key={i} {...g} burst={burst} />
        ))}
        <Animated.View style={pointsStyle}>
          <T style={styles.bigPoints} color={Colors.accentInk}>{pts}</T>
        </Animated.View>
      </Animated.View>

      {/* After the cut */}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.after]}>
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 150, alignSelf: 'stretch' }}>
          <Animated.View style={[styles.line, lineStyle]} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View onLayout={(e) => setWordWidth(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.block, blockStyle]} />
              <Animated.Text style={[styles.title, titleStyle, wordColor]} accessibilityRole="header">Accepted</Animated.Text>
            </View>
            <Animated.View style={[styles.caret, caretStyle]} />
          </View>
        </View>

        <Animated.View style={[{ alignSelf: 'stretch', gap: 16 }, payoffStyle]} pointerEvents={done ? 'auto' : 'none'}>
          <T variant="medium" style={{ textAlign: 'center', fontSize: 16 }}>
            #{params.num} {params.title}
          </T>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <T variant="bigStat">{data?.time_seconds != null ? formatDuration(data.time_seconds) : 'untimed'}</T>
              <T variant="label">time</T>
            </View>
            <View style={styles.stat}>
              <T variant="bigStat" color={Colors.accent}>{pts}</T>
              <T variant="label">points</T>
            </View>
            <View style={styles.stat}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {data?.first_today && data.streak > 0 ? <Odometer from={data.streak - 1} to={data.streak} progress={extras} /> : <T variant="bigStat">{data?.streak ?? '–'}</T>}
                <Flame size={18} color={Colors.medium} />
              </View>
              <T variant="label">day streak</T>
            </View>
          </View>

          {data?.first_today ? (
            <View style={[styles.payoffCard, styles.unlockCard]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LockOpen size={16} color={Colors.accent} />
                <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 12, letterSpacing: 1 }} color={Colors.accent}>HOME UNLOCKED</T>
              </View>
              {data.friends_today.length ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {data.friends_today.slice(0, 5).map((f, i) => (
                      <PopIn key={f.id} index={i} progress={extras}>
                        <View style={{ borderRadius: 18, borderWidth: 2, borderColor: Colors.bg }}>
                          <Avatar name={f.display_name} url={f.avatar_url} size={32} />
                        </View>
                      </PopIn>
                    ))}
                  </View>
                  <T variant="name" style={{ flex: 1 }}>
                    {data.friends_today.length} {data.friends_today.length === 1 ? 'friend' : 'friends'} solved today
                  </T>
                </View>
              ) : (
                <T variant="name">you’re first today. they’ll see yours.</T>
              )}
            </View>
          ) : h && HIcon ? (
            <View style={styles.payoffCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.hIcon}>
                  <HIcon size={20} color={h.icon === 'flame' ? Colors.medium : Colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="name" style={{ fontSize: 17 }}>{h.title}</T>
                  <T variant="monoSm">{h.body}</T>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ height: 76 }} />
          )}

          {data?.first_today ? (
            <Button title={data.friends_today.length ? 'See what they solved →' : 'Go to home →'} pill onPress={goHome} style={{ alignSelf: 'stretch' }} />
          ) : (
            <Button title="Back to feed" variant="secondary" onPress={goHome} />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, overflow: 'hidden' },
  flood: { position: 'absolute', backgroundColor: Colors.accent },
  center: { alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute', fontFamily: Fonts.monoBold, color: Colors.accentInk },
  bigPoints: { fontFamily: Fonts.monoBold, fontSize: 96, lineHeight: 110, letterSpacing: -5 },
  after: { justifyContent: 'center', alignItems: 'center', gap: 28, paddingHorizontal: 24 },
  title: { fontFamily: Fonts.monoBold, fontSize: 56, lineHeight: 66, color: Colors.text },
  // Editor-style current-line highlight, running past the screen gutter
  line: { position: 'absolute', left: -24, right: -24, top: 44, height: 62, backgroundColor: 'rgba(0, 214, 143, 0.08)', borderLeftWidth: 3, borderLeftColor: Colors.accent },
  block: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -10,
    right: -10,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    transformOrigin: 'left',
    shadowColor: Colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  caret: { width: 5, height: 58, marginLeft: 12, backgroundColor: Colors.text },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 6, padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  odo: { fontFamily: Fonts.monoSemiBold, fontSize: 24, lineHeight: 30, letterSpacing: -1, color: Colors.text },
  payoffCard: { gap: 12, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  unlockCard: { backgroundColor: Colors.accentTint, borderColor: Colors.accentLine },
  hIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderStrong },
});
