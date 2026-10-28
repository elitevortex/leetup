import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronDown, Lock, Pause, Play, Square, X } from 'lucide-react-native';
import { Colors, Fonts } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { fetchFeedState, fetchTeasers } from '../lib/api';
import { formatDuration } from '../lib/format';
import { activeMs, loadTimer, saveTimer, TimerState } from '../lib/timer';
import { Glow, Screen, T } from '../components/ui';

function tap() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

function Metric({ label, value, suffix, size = 56, color = Colors.text }: { label: string; value: string; suffix?: string; size?: number; color?: string }) {
  return (
    <View style={styles.metric}>
      <T variant="label" style={{ fontSize: 12, letterSpacing: 1.2 }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: size, lineHeight: size * 1.05, letterSpacing: -size * 0.05, fontVariant: ['tabular-nums'] }} color={color}>{value}</T>
        {suffix ? <T style={{ fontFamily: Fonts.monoMedium, fontSize: Math.max(15, size * 0.3), marginLeft: 4 }} color={Colors.text3}>{suffix}</T> : null}
      </View>
    </View>
  );
}

function RoundButton({ label, onPress, size, children, primary }: { label: string; onPress: () => void; size: number; children: React.ReactNode; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? Colors.accent : Colors.surface2,
          borderWidth: primary ? 0 : 1,
          borderColor: Colors.borderStrong,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
        primary ? styles.glow : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function TimerScreen() {
  const { userId } = useAuth();
  const [timer, setTimer] = useState<TimerState | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [solvesToday, setSolvesToday] = useState(0);
  const [avg, setAvg] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [friendsToday, setFriendsToday] = useState(0);
  const [locked, setLocked] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const discardTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadTimer().then(setTimer);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const [{ data: mine }, { data: streakValue }, teasers, state] = await Promise.all([
        supabase.from('solves').select('time_seconds, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.rpc('leetup_streak', { uid: userId }),
        fetchTeasers().catch(() => []),
        fetchFeedState().catch(() => null),
      ]);
      setLocked(state ? !state.unlocked : false);
      const rows = mine ?? [];
      setSolvesToday(rows.filter((r) => new Date(r.created_at) >= midnight).length);
      const timed = rows.map((r) => r.time_seconds).filter((t): t is number => t != null);
      setAvg(timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null);
      setStreak(typeof streakValue === 'number' ? streakValue : 0);
      setFriendsToday(new Set(teasers.map((t) => t.user_id)).size);
    })().catch(() => undefined);
  }, [userId]);

  const running = !!timer && !timer.pausedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const update = useCallback((next: TimerState | null) => {
    setTimer(next);
    setNow(Date.now());
    saveTimer(next);
  }, []);

  const start = () => {
    tap();
    update({ startedAt: Date.now(), pausedAt: null, pausedMs: 0 });
  };
  const togglePause = () => {
    if (!timer) return;
    tap();
    if (timer.pausedAt) update({ ...timer, pausedMs: timer.pausedMs + (Date.now() - timer.pausedAt), pausedAt: null });
    else update({ ...timer, pausedAt: Date.now() });
  };
  const stop = () => {
    if (!timer) return;
    tap();
    const end = Date.now();
    const active = Math.round(activeMs(timer, end) / 1000);
    router.replace({ pathname: '/post', params: { started_at: new Date(timer.startedAt).toISOString(), ended_at: new Date(end).toISOString(), active: String(active) } });
  };
  const discard = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      discardTimeout.current = setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    if (discardTimeout.current) clearTimeout(discardTimeout.current);
    setConfirmDiscard(false);
    update(null);
  };

  if (timer === undefined) return <Screen edges={['top', 'bottom']}>{null}</Screen>;

  const elapsed = timer ? Math.floor(activeMs(timer, now) / 1000) : 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <Glow size={380} style={{ bottom: -90 }} />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close timer" onPress={() => router.back()} style={styles.close} hitSlop={6}>
          <ChevronDown size={20} color={Colors.text2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          {timer ? (
            <View style={[styles.chip, { backgroundColor: Colors.hardTint, borderColor: Colors.hardLine }]}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.hard, opacity: timer.pausedAt ? 0.4 : 1 }} />
              <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.1 }} color={Colors.hard}>{timer.pausedAt ? 'PAUSED' : 'REC'}</T>
            </View>
          ) : locked && solvesToday === 0 ? (
            <View style={[styles.chip, { backgroundColor: Colors.accentTint, borderColor: Colors.accentLine }]}>
              <Lock size={12} color={Colors.accent} strokeWidth={2.4} />
              <T variant="monoMedium" style={{ fontSize: 11 }}>home locked · {friendsToday} solved today</T>
            </View>
          ) : null}
        </View>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        {!timer ? <View style={{ flex: 1 }} /> : <View style={{ height: 8 }} />}
        <Metric label="TIME" value={formatDuration(elapsed)} size={timer ? 92 : 100} color={timer ? Colors.text : Colors.text3} />
        <View style={styles.hair} />
        {timer ? (
          <>
            <Metric label="YOUR AVG SOLVE" value={avg != null ? formatDuration(avg) : '--:--'} color={Colors.text2} />
            <View style={styles.hair} />
            <Metric label="STREAK" value={String(streak)} suffix={streak === 1 ? 'day' : 'days'} />
            <View style={styles.hair} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}><Metric label="SOLVES TODAY" value={String(solvesToday)} size={48} /></View>
              <View style={{ flex: 1 }}><Metric label="STREAK" value={String(streak)} suffix={streak === 1 ? 'day' : 'days'} size={48} /></View>
            </View>
            <View style={styles.hair} />
            <T variant="mono" style={{ textAlign: 'center', marginTop: 16 }} color={Colors.text3}>// one problem. one timer. go.</T>
          </>
        )}
        <View style={{ flex: 1 }} />

        {timer ? (
          <View style={styles.controls}>
            <View style={{ marginBottom: 26 }}>
              <RoundButton label={timer.pausedAt ? 'Resume' : 'Pause'} onPress={togglePause} size={56}>
                {timer.pausedAt ? <Play size={22} color={Colors.text} fill={Colors.text} /> : <Pause size={22} color={Colors.text} fill={Colors.text} />}
              </RoundButton>
            </View>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <RoundButton label="Stop, solved" onPress={stop} size={92} primary>
                <Square size={28} color={Colors.accentInk} fill={Colors.accentInk} />
              </RoundButton>
              <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 12, letterSpacing: 1.4 }}>SOLVED</T>
            </View>
            <View style={{ marginBottom: 26, alignItems: 'center' }}>
              <RoundButton label={confirmDiscard ? 'Tap again to discard' : 'Discard'} onPress={discard} size={56}>
                <X size={22} color={confirmDiscard ? Colors.hard : Colors.text2} />
              </RoundButton>
              {confirmDiscard ? <T variant="monoSm" style={{ position: 'absolute', top: 62, width: 90, textAlign: 'center', fontSize: 10 }} color={Colors.hard}>tap again</T> : null}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <RoundButton label="Start timer" onPress={start} size={92} primary>
              <Play size={34} color={Colors.accentInk} fill={Colors.accentInk} style={{ marginLeft: 4 }} />
            </RoundButton>
            <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 12, letterSpacing: 1.4 }}>START</T>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/post')} hitSlop={8} style={{ marginTop: 6 }}>
              <T variant="monoSm">solved without the timer? post it →</T>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 28 },
  metric: { alignItems: 'center', gap: 6, paddingVertical: 18 },
  hair: { height: 1, backgroundColor: Colors.border },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  glow: { shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
});
