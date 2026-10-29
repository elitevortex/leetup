import { ReactNode, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AtSign, Bell, Check, Heart, MessageCircle, UserPlus } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { acceptFriendRequest, fetchFriendships, fetchNotifications, markNotificationsRead } from '../lib/api';
import { formatTimestamp } from '../lib/format';
import { splitCode } from '../lib/social';
import { AppNotification, NotificationKind } from '../types';
import { Avatar, EmptyState, Loading, NavHeader, Screen, SectionLabel, T } from '../components/ui';

const EXCERPT = 80;

const TITLES: Record<NotificationKind, string> = {
  like: 'New like',
  comment: 'New comment',
  mention: 'Mentioned you',
  friend_request: 'Friend request',
  friend_accept: 'Request accepted',
};

function Badge({ kind }: { kind: NotificationKind }) {
  const icon: Record<NotificationKind, ReactNode> = {
    like: <Heart size={10} color={Colors.accentInk} fill={Colors.accentInk} />,
    comment: <MessageCircle size={10} color={Colors.accentInk} strokeWidth={2.5} />,
    mention: <AtSign size={10} color={Colors.accentInk} strokeWidth={2.5} />,
    friend_request: <UserPlus size={10} color={Colors.accentInk} strokeWidth={2.5} />,
    friend_accept: <Check size={10} color={Colors.accentInk} strokeWidth={3} />,
  };
  return <View style={[styles.badge, { backgroundColor: kind === 'like' ? Colors.like : Colors.accent }]}>{icon[kind]}</View>;
}

function dayBucket(iso: string, now = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Earlier';
}

function Body({ n }: { n: AppNotification }) {
  const actor = n.actor?.display_name ?? 'Someone';
  if (n.kind === 'comment' || n.kind === 'mention') {
    const raw = (n.comment?.body ?? '').replace(/\s+/g, ' ').trim();
    const excerpt = raw.length > EXCERPT ? `${raw.slice(0, EXCERPT).trimEnd()}…` : raw;
    return (
      <T style={styles.body} numberOfLines={2}>
        {`${actor}: “`}
        {splitCode(excerpt).map((p, i) => (p.code ? <T key={i} style={styles.code}>{p.text}</T> : p.text))}
        {'”'}
      </T>
    );
  }
  const text =
    n.kind === 'like'
      ? `${actor} liked your ${n.solve?.problem?.title ?? 'post'}`
      : n.kind === 'friend_request'
        ? `${actor} wants to add you`
        : `${actor} accepted your request`;
  return <T style={styles.body} numberOfLines={2}>{text}</T>;
}

type Row = { type: 'section'; key: string; label: string } | { type: 'item'; key: string; n: AppNotification };

export default function Notifications() {
  const { userId } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  // Requesters whose request is still pending, and people we've become friends with
  const [pending, setPending] = useState<Set<string> | null>(null);
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [list, rows] = await Promise.all([fetchNotifications(), fetchFriendships(userId).catch(() => null)]);
    setItems(list);
    if (rows) {
      setPending(new Set(rows.filter((r) => r.status === 'pending' && r.direction === 'incoming').map((r) => r.other.id)));
      setFriends(new Set(rows.filter((r) => r.status === 'accepted').map((r) => r.other.id)));
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setItems((prev) => prev ?? []));
      // Leaving the screen counts as having seen everything
      return () => {
        markNotificationsRead().catch(() => undefined);
      };
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  };

  const readAll = async () => {
    setError(null);
    try {
      await markNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev);
    } catch {
      setError('Couldn’t mark everything read. Try again.');
    }
  };

  const accept = async (requesterId: string) => {
    if (!userId || accepting) return;
    setAccepting(requesterId);
    setError(null);
    try {
      await acceptFriendRequest(requesterId, userId);
      setFriends((prev) => new Set(prev).add(requesterId));
      setPending((prev) => {
        if (!prev) return prev;
        const next = new Set(prev);
        next.delete(requesterId);
        return next;
      });
    } catch {
      setError('Couldn’t accept that request. Try again.');
    } finally {
      setAccepting(null);
    }
  };

  const open = (n: AppNotification) => {
    if ((n.kind === 'like' || n.kind === 'comment' || n.kind === 'mention') && n.solve_id) {
      router.push({ pathname: '/solve/[id]', params: { id: n.solve_id } });
    } else if ((n.kind === 'friend_request' || n.kind === 'friend_accept') && n.actor) {
      router.push({ pathname: '/u/[username]', params: { username: n.actor.username } });
    }
  };

  const rows: Row[] = useMemo(() => {
    if (!items) return [];
    const out: Row[] = [];
    let current: string | null = null;
    for (const n of items) {
      const bucket = dayBucket(n.created_at);
      if (bucket !== current) {
        current = bucket;
        out.push({ type: 'section', key: bucket, label: bucket });
      }
      out.push({ type: 'item', key: n.id, n });
    }
    return out;
  }, [items]);

  const hasUnread = !!items?.some((n) => !n.read_at);

  const readAllButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mark all notifications read"
      accessibilityState={{ disabled: !hasUnread }}
      onPress={hasUnread ? readAll : undefined}
      hitSlop={8}
      style={{ opacity: hasUnread ? 1 : 0.4 }}
    >
      <T style={{ fontFamily: Fonts.mono, fontSize: 12 }} color={Colors.accent}>read all</T>
    </Pressable>
  );

  if (!items) {
    return (
      <Screen>
        <NavHeader title="Notifications" />
        <Loading />
      </Screen>
    );
  }

  const renderItem = (n: AppNotification) => {
    const unread = !n.read_at;
    const actorId = n.actor?.id;
    // Without friendship data, offer Accept and let the server decide
    const showAccept = n.kind === 'friend_request' && !!actorId && !friends.has(actorId) && (pending ? pending.has(actorId) : true);
    const showFriends = n.kind === 'friend_request' && !!actorId && friends.has(actorId);
    return (
      <Pressable
        // A row that holds its own Accept button can't itself be a button (nested buttons are invalid on web)
        accessibilityRole={showAccept ? undefined : 'button'}
        accessibilityLabel={`${unread ? 'Unread. ' : ''}${TITLES[n.kind]}. ${formatTimestamp(n.created_at)}`}
        onPress={() => open(n)}
        style={({ pressed }) => [styles.row, unread && { backgroundColor: Colors.accentTint }, pressed && { opacity: 0.8 }]}
      >
        <View>
          <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={44} />
          <Badge kind={n.kind} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T style={styles.title}>{TITLES[n.kind]}</T>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>
          <Body n={n} />
          <T style={styles.time}>{formatTimestamp(n.created_at)}</T>
        </View>
        {showAccept ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept friend request from ${n.actor?.display_name}`}
            accessibilityState={{ busy: accepting === actorId }}
            onPress={() => accept(actorId!)}
            hitSlop={6}
            style={({ pressed }) => [styles.accept, { opacity: accepting === actorId ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            <T style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13 }} color={Colors.accentInk}>Accept</T>
          </Pressable>
        ) : showFriends ? (
          <T style={{ fontFamily: Fonts.mono, fontSize: 12 }} color={Colors.accent}>friends ✓</T>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Screen>
      <NavHeader title="Notifications" right={readAllButton} />
      {error ? (
        <T variant="bodySm" color={Colors.hard} style={{ paddingHorizontal: 16, paddingBottom: 8 }} accessibilityLiveRegion="polite">{error}</T>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
        ListEmptyComponent={<EmptyState icon={<Bell size={28} color={Colors.text3} />} title="No notifications yet" />}
        renderItem={({ item }) =>
          item.type === 'section' ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              <SectionLabel>{item.label}</SectionLabel>
            </View>
          ) : (
            renderItem(item.n)
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bg },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: Colors.text },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.accent },
  body: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 19, color: Colors.text2 },
  code: { fontFamily: Fonts.monoMedium, color: Colors.accent },
  time: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, color: Colors.text3 },
  accept: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.accent },
});
