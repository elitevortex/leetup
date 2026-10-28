import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Check, Flame, UserX } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { acceptFriendRequest, fetchProfileSummary, fetchUserSolves, removeFriendship, sendFriendRequest, syncProfile } from '../lib/api';
import { formatDuration } from '../lib/format';
import { buildCalendar } from '../lib/profile';
import { FeedSolve, ProfileSummary, Relationship } from '../types';
import { Avatar, Button, DifficultyPill, EmptyState, Loading, SectionLabel, T } from './ui';

function cellColor(count: number, future: boolean) {
  if (future) return 'transparent';
  if (count >= 6) return Colors.accent;
  if (count >= 3) return 'rgba(0, 214, 143, 0.65)';
  if (count >= 1) return 'rgba(0, 214, 143, 0.35)';
  return Colors.surface2;
}

function StatCard({ value, label, icon }: { value: string; label: string; icon?: ReactNode }) {
  return (
    <View style={styles.statCard} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T variant="bigStat">{value}</T>
        {icon}
      </View>
      <T variant="label">{label}</T>
    </View>
  );
}

function ContributionGrid({ calendar }: { calendar: Record<string, number> | null }) {
  const { columns, activeDays, submissions } = useMemo(() => buildCalendar(calendar), [calendar]);
  return (
    <View style={styles.card}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`LeetCode activity, last 12 weeks: ${activeDays} active days, ${submissions} submissions`}
        style={{ flexDirection: 'row', gap: 4 }}
      >
        {columns.map((col) => (
          <View key={col[0].key} style={{ flex: 1, gap: 4 }}>
            {col.map((cell) => (
              <View key={cell.key} style={{ aspectRatio: 1, borderRadius: 5, backgroundColor: cellColor(cell.count, cell.future) }} />
            ))}
          </View>
        ))}
      </View>
      <T style={{ fontFamily: Fonts.mono, fontSize: 11 }} color={Colors.text3}>
        synced from leetcode · {activeDays} active {activeDays === 1 ? 'day' : 'days'}
      </T>
    </View>
  );
}

function RecentRow({ solve }: { solve: FeedSolve }) {
  const time = solve.time_seconds != null ? formatDuration(solve.time_seconds) : 'untimed';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${solve.problem.title}, ${solve.problem.difficulty}, ${time}`}
      onPress={() => router.push({ pathname: '/solve/[id]', params: { id: solve.id } })}
      style={({ pressed }) => [styles.recentRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      <T variant="monoSm">#{solve.problem.frontend_id}</T>
      <T variant="medium" style={{ flex: 1 }} numberOfLines={1}>{solve.problem.title}</T>
      <DifficultyPill difficulty={solve.problem.difficulty} />
      <T variant="stat">{time}</T>
    </Pressable>
  );
}

function RelationshipAction({ summary, onChange }: { summary: ProfileSummary; onChange: (rel: Relationship, friendsDelta: number) => void }) {
  const { userId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rel = summary.relationship;

  // Optimistic: flip the state now, put it back if the write fails
  const run = async (next: Relationship, delta: number, write: () => Promise<void>) => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    setConfirming(false);
    onChange(next, delta);
    try {
      await write();
    } catch {
      onChange(rel, -delta);
      setError('couldn’t update. try again.');
    } finally {
      setBusy(false);
    }
  };

  let button: ReactNode;
  if (rel === 'none') {
    button = <Button title="Add friend" onPress={() => run('request_sent', 0, () => sendFriendRequest(userId!, summary.id))} />;
  } else if (rel === 'request_received') {
    button = <Button title="Accept" onPress={() => run('friends', 1, () => acceptFriendRequest(summary.id, userId!))} />;
  } else if (rel === 'request_sent') {
    button = confirming ? (
      <Button title="Cancel request?" variant="danger" onPress={() => run('none', 0, () => removeFriendship(userId!, summary.id))} />
    ) : (
      <Button title="Requested" variant="secondary" onPress={() => setConfirming(true)} />
    );
  } else if (rel === 'friends') {
    button = confirming ? (
      <Button title="Remove friend?" variant="danger" onPress={() => run('none', -1, () => removeFriendship(userId!, summary.id))} />
    ) : (
      <Button title="Friends ✓" variant="secondary" onPress={() => setConfirming(true)} />
    );
  } else {
    return null;
  }

  return (
    <View style={{ gap: 6 }}>
      {button}
      {confirming ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Never mind" onPress={() => setConfirming(false)} style={{ alignSelf: 'center', padding: 4 }}>
          <T variant="monoSm">never mind</T>
        </Pressable>
      ) : null}
      {error ? <T variant="monoSm" color={Colors.hard} style={{ textAlign: 'center' }}>{error}</T> : null}
    </View>
  );
}

export function ProfileView({ username }: { username: string }) {
  const { userId } = useAuth();
  const [summary, setSummary] = useState<ProfileSummary | null | undefined>(undefined);
  const [solves, setSolves] = useState<FeedSolve[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const s = await fetchProfileSummary(username);
    // Set both together so "no posts yet" never flashes while solves are still loading
    const recent = s ? await fetchUserSolves(s.id, userId, 10) : [];
    setSummary(s);
    setSolves(recent);
    setFailed(false);
  }, [username, userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setFailed(true));
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    // Your own stats come from LeetCode; pull them fresh before reloading
    if (summary?.relationship === 'self') await syncProfile(true).catch(() => undefined);
    await load().catch(() => setFailed(true));
    setRefreshing(false);
  };

  const changeRelationship = useCallback((relationship: Relationship, friendsDelta: number) => {
    setSummary((prev) => (prev ? { ...prev, relationship, friends_count: Math.max(0, prev.friends_count + friendsDelta) } : prev));
  }, []);

  if (summary === undefined) {
    if (!failed) return <Loading />;
    return (
      <EmptyState
        title="Couldn’t load profile"
        body="Check your connection and try again."
        action={<Button title="Try again" pill variant="secondary" onPress={() => { setFailed(false); load().catch(() => setFailed(true)); }} />}
      />
    );
  }

  if (summary === null) {
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}>
        <EmptyState icon={<UserX size={28} color={Colors.text3} />} title="Profile unavailable" body="This person may have blocked you or deleted their account." />
      </ScrollView>
    );
  }

  const self = summary.relationship === 'self';
  const solved = summary.lc_easy + summary.lc_medium + summary.lc_hard;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={summary.display_name} url={summary.avatar_url} size={64} ring={self ? Colors.accent : undefined} />
        <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
          <T style={{ fontFamily: Fonts.sansSemiBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }} color={Colors.text} numberOfLines={1}>
            {summary.display_name}
          </T>
          {summary.leetcode_username ? (
            <View style={styles.chip} accessible accessibilityLabel={`LeetCode account connected: ${summary.leetcode_username}`}>
              <Check size={12} color={Colors.accent} strokeWidth={2.6} />
              <T style={{ fontFamily: Fonts.monoMedium, fontSize: 11 }} color={Colors.accent}>leetcode · @{summary.leetcode_username}</T>
            </View>
          ) : (
            <T style={{ fontFamily: Fonts.mono, fontSize: 12 }} color={Colors.text3}>@{summary.username}</T>
          )}
        </View>
      </View>

      {!self ? <RelationshipAction summary={summary} onChange={changeRelationship} /> : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard value={solved.toLocaleString('en-US')} label="Solved" />
        <StatCard value={String(summary.streak)} label="Day streak" icon={<Flame size={18} color={Colors.medium} />} />
        <StatCard value={String(summary.friends_count)} label="Friends" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <T style={styles.diff} color={Colors.easy}>{summary.lc_easy} easy</T>
        <T style={styles.diff} color={Colors.text3}>·</T>
        <T style={styles.diff} color={Colors.medium}>{summary.lc_medium} med</T>
        <T style={styles.diff} color={Colors.text3}>·</T>
        <T style={styles.diff} color={Colors.hard}>{summary.lc_hard} hard</T>
      </View>

      <SectionLabel>Last 12 weeks</SectionLabel>
      <ContributionGrid calendar={summary.lc_calendar} />

      <SectionLabel>Recent</SectionLabel>
      {solves.length ? (
        <View>
          {solves.map((s) => <RecentRow key={s.id} solve={s} />)}
        </View>
      ) : (
        <T variant="monoSm">no posts yet</T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
  statCard: { flex: 1, gap: 4, padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  card: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  diff: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16 },
});
