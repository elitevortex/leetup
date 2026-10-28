import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Ellipsis, Lock } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { addComment, deleteComment, fetchComments, fetchSolve, setLiked } from '../../lib/api';
import { formatTimestamp } from '../../lib/format';
import { splitCode } from '../../lib/social';
import { Comment, FeedSolve } from '../../types';
import { Avatar, Button, EmptyState, IconButton, Loading, NavHeader, Screen, SectionLabel, T } from '../../components/ui';
import { SolveCard } from '../../components/SolveCard';

const CONFIRM_MS = 4000;

function CommentBody({ body }: { body: string }) {
  return (
    <T style={styles.body}>
      {splitCode(body).map((p, i) =>
        p.code ? <T key={i} style={styles.code}>{p.text}</T> : p.text,
      )}
    </T>
  );
}

export default function SolveDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, profile } = useAuth();
  // undefined while loading, null when the post is locked or deleted
  const [solve, setSolve] = useState<FeedSolve | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    if (!userId || !id) return;
    setLoadError(false);
    try {
      const s = await fetchSolve(id, userId);
      setSolve(s);
      setComments(s ? await fetchComments(id) : []);
    } catch {
      setLoadError(true);
    }
  }, [id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // A pending "tap again to delete" quietly expires
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const toggleLike = useCallback(
    async (s: FeedSolve) => {
      if (!userId) return;
      const next = !s.liked_by_me;
      setSolve((prev) => (prev ? { ...prev, liked_by_me: next, likes_count: prev.likes_count + (next ? 1 : -1) } : prev));
      try {
        await setLiked(s.id, userId, next);
      } catch {
        setSolve((prev) => (prev ? { ...prev, liked_by_me: s.liked_by_me, likes_count: s.likes_count } : prev));
      }
    },
    [userId],
  );

  const openMore = () => {
    if (!solve) return;
    router.push({
      pathname: '/report',
      params: { solveId: solve.id, ownerId: solve.user_id, ownerName: solve.profile.display_name, ownerUsername: solve.profile.username, title: `#${solve.problem.frontend_id} ${solve.problem.title}` },
    });
  };

  const reportComment = (c: Comment) =>
    router.push({ pathname: '/report', params: { commentId: c.id, ownerId: c.user_id, ownerName: c.profile.display_name, ownerUsername: c.profile.username, title: 'comment' } });

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId || !id || sending) return;
    setSending(true);
    setError(null);
    try {
      await addComment(id, userId, body);
      setDraft('');
      const next = await fetchComments(id);
      setComments(next);
      setSolve((prev) => (prev ? { ...prev, comments_count: next.length } : prev));
    } catch {
      setError('Couldn’t post your comment. Try again.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (c: Comment) => {
    if (confirmDelete !== c.id) {
      setConfirmDelete(c.id);
      return;
    }
    setConfirmDelete(null);
    setError(null);
    try {
      await deleteComment(c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      setSolve((prev) => (prev ? { ...prev, comments_count: Math.max(0, prev.comments_count - 1) } : prev));
    } catch {
      setError('Couldn’t delete that comment. Try again.');
    }
  };

  const more = solve ? (
    <IconButton label="More options" onPress={openMore}>
      <Ellipsis size={18} color={Colors.text} />
    </IconButton>
  ) : null;

  if (loadError) {
    return (
      <Screen>
        <NavHeader title="Post" />
        <EmptyState title="Couldn’t load this post" body="Check your connection and try again." action={<Button title="Try again" pill onPress={load} />} />
      </Screen>
    );
  }

  if (solve === undefined) {
    return (
      <Screen>
        <NavHeader title="Post" />
        <Loading />
      </Screen>
    );
  }

  if (solve === null) {
    return (
      <Screen>
        <NavHeader title="Post" />
        <EmptyState icon={<Lock size={28} color={Colors.text3} />} title="This post is locked or gone" body="Post a solve today to see your friends’ posts." />
      </Screen>
    );
  }

  const ownsSolve = solve.user_id === userId;
  const canSend = draft.trim().length > 0 && !sending;

  return (
    <Screen>
      <NavHeader title="Post" right={more} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            <View style={{ gap: 18, paddingBottom: 6 }}>
              <SolveCard solve={solve} pressable={false} highlightComments onToggleLike={toggleLike} />
              <SectionLabel>{`${solve.comments_count} ${solve.comments_count === 1 ? 'comment' : 'comments'}`}</SectionLabel>
            </View>
          }
          ListEmptyComponent={<T variant="monoSm" style={{ paddingVertical: 14 }}>// no comments yet · say something nice</T>}
          renderItem={({ item }) => {
            const mine = item.user_id === userId;
            const canDelete = mine || ownsSolve;
            const confirming = confirmDelete === item.id;
            return (
              <Pressable
                accessibilityRole="text"
                accessibilityLabel={`${item.profile.display_name}, ${formatTimestamp(item.created_at)}: ${item.body}`}
                accessibilityHint={mine ? undefined : 'Long press to report'}
                accessibilityActions={mine ? undefined : [{ name: 'longpress', label: 'Report comment' }]}
                onAccessibilityAction={mine ? undefined : () => reportComment(item)}
                onLongPress={mine ? undefined : () => reportComment(item)}
                style={({ pressed }) => [styles.comment, pressed && !mine && { opacity: 0.7 }]}
              >
                <Avatar name={item.profile.display_name} url={item.profile.avatar_url} size={32} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <T style={styles.name} numberOfLines={1}>{item.profile.display_name}</T>
                    <T style={styles.time}>{formatTimestamp(item.created_at)}</T>
                  </View>
                  <CommentBody body={item.body} />
                  {canDelete ? (
                    <View style={{ flexDirection: 'row', paddingTop: 2 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={confirming ? 'Confirm delete comment' : 'Delete comment'}
                        onPress={() => remove(item)}
                        hitSlop={8}
                      >
                        <T variant="monoSm" color={confirming ? Colors.hard : Colors.text3}>{confirming ? 'tap again to delete' : 'delete'}</T>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {error ? (
            <T variant="bodySm" color={Colors.hard} accessibilityLiveRegion="polite">{error}</T>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url} size={32} />
            <View style={styles.pill}>
              <T style={{ fontFamily: Fonts.monoMedium, fontSize: 15 }} color={Colors.accent}>{'>'}</T>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="add a comment… `code` works"
                placeholderTextColor={Colors.text3}
                selectionColor={Colors.accent}
                maxLength={500}
                multiline
                accessibilityLabel="Add a comment"
                style={styles.field}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              onPress={canSend ? send : undefined}
              style={({ pressed }) => [styles.send, { opacity: !canSend ? 0.4 : pressed ? 0.85 : 1 }]}
            >
              {sending ? <ActivityIndicator size="small" color={Colors.accentInk} /> : <ArrowUp size={20} color={Colors.accentInk} strokeWidth={2.5} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  name: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 18, color: Colors.text, flexShrink: 1 },
  time: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, color: Colors.text3 },
  body: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20, color: Colors.text2 },
  code: { fontFamily: Fonts.monoMedium, color: Colors.accent },
  composer: { gap: 8, paddingTop: 10, paddingHorizontal: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderStrong },
  field: { flex: 1, fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, paddingVertical: 0, minHeight: 20, maxHeight: 96 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
});
