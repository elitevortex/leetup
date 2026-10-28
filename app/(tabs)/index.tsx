import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BadgeCheck, Bell, ChevronRight, CircleCheck, Lock, Search, Sparkles, UserPlus } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { fetchFeed, fetchFeedState, fetchTeasers, setLiked, unreadNotificationCount } from '../../lib/api';
import { formatTimestamp } from '../../lib/format';
import { getHiddenSolves } from '../../lib/social';
import { FeedSolve, FeedState, Teaser } from '../../types';
import { AvatarStack, Button, EmptyState, Loading, Screen, SectionLabel, T, Wordmark } from '../../components/ui';
import { SolveCard } from '../../components/SolveCard';
import { LockedPanel } from '../../components/LockedPanel';

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function clock(iso: string) {
  return formatTimestamp(iso).replace(/^Today at /, '');
}

function HeaderActions({ unread }: { unread: number }) {
  return (
    <View style={styles.pill}>
      <Pressable accessibilityRole="button" accessibilityLabel="Find friends" onPress={() => router.push('/friends')} style={styles.pillBtn} hitSlop={4}>
        <Search size={20} color={Colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
        style={styles.pillBtn}
        hitSlop={4}
      >
        <Bell size={20} color={Colors.text} />
        {unread > 0 ? <View style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

function LockBanner({ teasers }: { teasers: Teaser[] }) {
  const people = useMemo(() => {
    const seen = new Map<string, Teaser>();
    teasers.forEach((t) => !seen.has(t.user_id) && seen.set(t.user_id, t));
    return [...seen.values()];
  }, [teasers]);
  const names = people.slice(0, 3).map((p) => p.display_name.split(' ')[0].toLowerCase());
  const rest = people.length - names.length;
  return (
    <View style={styles.banner}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {people.length ? <AvatarStack people={people.map((p) => ({ id: p.user_id, name: p.display_name, url: p.avatar_url }))} /> : null}
        <View style={{ flex: 1 }} />
        <View style={styles.lockedChip}>
          <Lock size={12} color={Colors.accent} strokeWidth={2.4} />
          <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }} color={Colors.accent}>LOCKED</T>
        </View>
      </View>
      <T variant="h2" style={{ fontSize: 21 }}>
        {people.length === 0 ? 'Nobody’s solved yet today' : `${people.length} ${people.length === 1 ? 'friend' : 'friends'} solved today`}
      </T>
      <T variant="monoSm" color={Colors.text2}>
        {people.length === 0
          ? '// first one in sets the pace'
          : `// ${names.join(', ')}${rest > 0 ? ` +${rest} more` : ''} · latest ${clock(teasers[0].created_at)}`}
      </T>
    </View>
  );
}

// Shown until the LeetCode account is verified; the first post does it
function VerifyStrip({ username }: { username: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Verify @${username}`} onPress={() => router.push('/verify')} style={styles.verify}>
      <BadgeCheck size={16} color={Colors.medium} />
      <T variant="monoMedium" style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>
        your first post verifies @{username}
      </T>
      <ChevronRight size={16} color={Colors.text3} />
    </Pressable>
  );
}

type Row = { type: 'section'; key: string; label: string } | { type: 'solve'; key: string; solve: FeedSolve };

export default function Home() {
  const { userId, link, verified } = useAuth();
  const [feed, setFeed] = useState<FeedSolve[] | null>(null);
  const [teasers, setTeasers] = useState<Teaser[]>([]);
  const [state, setState] = useState<FeedState | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [f, t, s, u, hidden] = await Promise.all([fetchFeed(userId), fetchTeasers(), fetchFeedState(), unreadNotificationCount(), getHiddenSolves()]);
    setState(s);
    setFeed(f.filter((s) => !hidden.has(s.id)));
    setTeasers(t);
    setUnread(u);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setFeed((prev) => prev ?? []));
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  };

  const toggleLike = useCallback(
    async (solve: FeedSolve) => {
      if (!userId) return;
      const next = !solve.liked_by_me;
      const patch = (s: FeedSolve) => (s.id === solve.id ? { ...s, liked_by_me: next, likes_count: s.likes_count + (next ? 1 : -1) } : s);
      setFeed((prev) => prev?.map(patch) ?? prev);
      try {
        await setLiked(solve.id, userId, next);
      } catch {
        setFeed((prev) => prev?.map((s) => (s.id === solve.id ? solve : s)) ?? prev);
      }
    },
    [userId],
  );

  const openMore = useCallback(
    (solve: FeedSolve) =>
      router.push({ pathname: '/report', params: { solveId: solve.id, ownerId: solve.user_id, ownerName: solve.profile.display_name, ownerUsername: solve.profile.username, title: `#${solve.problem.frontend_id} ${solve.problem.title}` } }),
    [],
  );

  const myToday = feed?.find((s) => s.user_id === userId && isToday(s.created_at));
  // The database decides; a fresh post counts straight away
  const unlocked = !!myToday || !!state?.unlocked;

  const rows: Row[] = useMemo(() => {
    if (!feed) return [];
    const today = feed.filter((s) => isToday(s.created_at));
    const earlier = feed.filter((s) => !isToday(s.created_at));
    const out: Row[] = [];
    if (today.length) {
      out.push({ type: 'section', key: 'today', label: `Today · ${today.length} ${today.length === 1 ? 'solve' : 'solves'}` });
      today.forEach((s) => out.push({ type: 'solve', key: s.id, solve: s }));
    }
    if (earlier.length) {
      out.push({ type: 'section', key: 'earlier', label: 'Earlier' });
      earlier.forEach((s) => out.push({ type: 'solve', key: s.id, solve: s }));
    }
    return out;
  }, [feed]);

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}><Wordmark /></View>
      <HeaderActions unread={unread} />
    </View>
  );

  if (!feed) return <Screen>{header}<Loading /></Screen>;

  if (!unlocked) {
    return (
      <Screen>
        {header}
        <View style={{ flex: 1, gap: 14, paddingHorizontal: 16, paddingTop: 4 }}>
          {!verified && link ? <VerifyStrip username={link.leetcode_username} /> : null}
          <LockBanner teasers={teasers} />
          <LockedPanel teasers={teasers} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {myToday ? (
              <View style={styles.strip}>
                <CircleCheck size={16} color={Colors.accent} />
                <T variant="monoMedium" style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>
                  unlocked · {myToday.problem.title} · {clock(myToday.created_at)}
                </T>
              </View>
            ) : (
              <View style={styles.strip}>
                <Sparkles size={16} color={Colors.accent} />
                <T variant="monoMedium" style={{ fontSize: 12, flex: 1 }} numberOfLines={2}>
                  day one · everything’s open till midnight. after that, post to unlock
                </T>
              </View>
            )}
            {!verified && link ? <VerifyStrip username={link.leetcode_username} /> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<UserPlus size={28} color={Colors.text3} />}
            title="Your feed is quiet"
            body="Add friends to see their solves here."
            action={<Button title="Find friends" pill onPress={() => router.push('/friends')} />}
          />
        }
        renderItem={({ item }) =>
          item.type === 'section' ? (
            <SectionLabel>{item.label}</SectionLabel>
          ) : (
            <SolveCard solve={item.solve} onToggleLike={toggleLike} onMore={openMore} />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  pill: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  pillBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, borderWidth: 2, borderColor: Colors.surface },
  banner: { gap: 10, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
  lockedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.mediumTint, borderWidth: 1, borderColor: Colors.mediumLine },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 2, borderRadius: Radius.md, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
});
