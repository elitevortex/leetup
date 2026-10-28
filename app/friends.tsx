import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, QrCode, X } from 'lucide-react-native';
import { Colors } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { acceptFriendRequest, fetchFriendships, removeFriendship, searchPeople, sendFriendRequest } from '../lib/api';
import { daysAgo } from '../lib/friends';
import { FriendRow, PersonSummary } from '../types';
import { Avatar, Button, EmptyState, Input, Loading, NavHeader, Screen, SectionLabel, SmallButton, T } from '../components/ui';

const CONFIRM_MS = 3000;

function openProfile(username: string) {
  router.push({ pathname: '/u/[username]', params: { username } });
}

function PersonRow({ person, right, onPress }: { person: PersonSummary; right?: ReactNode; onPress?: () => void }) {
  const open = onPress ?? (() => openProfile(person.username));
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${person.display_name}, @${person.username}`}
        onPress={open}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
      >
        <Avatar name={person.display_name} url={person.avatar_url} size={36} />
        <View style={{ flex: 1 }}>
          <T variant="name" numberOfLines={1}>{person.display_name}</T>
          <T variant="monoSm" numberOfLines={1}>@{person.username}</T>
        </View>
      </Pressable>
      {right}
    </View>
  );
}

export default function Friends() {
  const { userId } = useAuth();
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setRows(await fetchFriendships(userId));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {
        setRows((prev) => prev ?? []);
        setError('Couldn’t load friends. Check your connection.');
      });
    }, [load]),
  );

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const term = query.trim();
  const searchMode = term.length >= 2;

  // Debounced people search
  useEffect(() => {
    if (!userId || !searchMode) {
      setResults([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchPeople(term, userId)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [term, searchMode, userId]);

  const byOther = useMemo(() => new Map((rows ?? []).map((r) => [r.other.id, r])), [rows]);
  const requests = (rows ?? []).filter((r) => r.status === 'pending' && r.direction === 'incoming');
  const sent = (rows ?? []).filter((r) => r.status === 'pending' && r.direction === 'outgoing');
  const friends = (rows ?? []).filter((r) => r.status === 'accepted');

  // Optimistic change: apply locally, run the request, put the old row back if it fails
  const mutate = async (otherId: string, next: FriendRow | null, request: () => Promise<void>, failMsg: string) => {
    const prev = byOther.get(otherId) ?? null;
    const swap = (to: FriendRow | null) =>
      setRows((rs) => {
        const rest = (rs ?? []).filter((r) => r.other.id !== otherId);
        return to ? [to, ...rest] : rest;
      });
    setError(null);
    swap(next);
    try {
      await request();
    } catch {
      swap(prev);
      setError(failMsg);
    }
  };

  const add = (p: PersonSummary) => {
    if (!userId) return;
    const row: FriendRow = { requester_id: userId, addressee_id: p.id, status: 'pending', created_at: new Date().toISOString(), other: p, direction: 'outgoing' };
    mutate(p.id, row, () => sendFriendRequest(userId, p.id), `Couldn’t send a request to @${p.username}.`);
  };

  const accept = (r: FriendRow) => {
    if (!userId) return;
    mutate(r.other.id, { ...r, status: 'accepted' }, () => acceptFriendRequest(r.other.id, userId), `Couldn’t accept @${r.other.username}.`);
  };

  const remove = (r: FriendRow, failMsg: string) => {
    if (!userId) return;
    mutate(r.other.id, null, () => removeFriendship(userId, r.other.id), failMsg);
  };

  // First tap arms the cancel, second tap within a few seconds confirms
  const tapCancel = (r: FriendRow) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (confirmCancel === r.other.id) {
      setConfirmCancel(null);
      remove(r, `Couldn’t cancel the request to @${r.other.username}.`);
      return;
    }
    setConfirmCancel(r.other.id);
    confirmTimer.current = setTimeout(() => setConfirmCancel(null), CONFIRM_MS);
  };

  const searchAction = (p: PersonSummary) => {
    const r = byOther.get(p.id);
    if (!r) return <SmallButton title="Add" variant="primary" onPress={() => add(p)} />;
    if (r.status === 'accepted') return <T variant="mono" color={Colors.accent}>friends ✓</T>;
    if (r.direction === 'incoming') return <SmallButton title="Accept" variant="primary" onPress={() => accept(r)} />;
    return <T variant="mono">sent</T>;
  };

  const renderSearch = () => {
    if (searching && results.length === 0) return <ActivityIndicator color={Colors.accent} style={{ paddingVertical: 24 }} />;
    if (results.length === 0) return <T variant="monoSm" style={{ textAlign: 'center', paddingVertical: 24 }}>{`no one called “${term}”`}</T>;
    return results.map((p) => <PersonRow key={p.id} person={p} right={searchAction(p)} />);
  };

  const renderLists = () => {
    if (!rows) return <Loading />;
    if (requests.length === 0 && friends.length === 0 && sent.length === 0) {
      return (
        <EmptyState
          title="Add your first friend"
          body="Share your code or search by username."
          action={<Button title="Show my QR code" pill onPress={() => router.push('/qr')} style={{ marginTop: 8 }} />}
        />
      );
    }
    return (
      <>
        {requests.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{`REQUESTS (${requests.length})`}</SectionLabel>
            {requests.map((r) => (
              <PersonRow
                key={r.other.id}
                person={r.other}
                right={
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <SmallButton title="Decline" onPress={() => remove(r, `Couldn’t decline @${r.other.username}.`)} />
                    <SmallButton title="Accept" variant="primary" onPress={() => accept(r)} />
                  </View>
                }
              />
            ))}
          </View>
        ) : null}
        {sent.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{`SENT (${sent.length})`}</SectionLabel>
            {sent.map((r) => {
              const arming = confirmCancel === r.other.id;
              return (
                <PersonRow
                  key={r.other.id}
                  person={r.other}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <T variant="monoSm" color={arming ? Colors.hard : Colors.text3}>{arming ? 'tap again to cancel' : `sent · ${daysAgo(r.created_at)}`}</T>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={arming ? `Confirm cancel request to @${r.other.username}` : `Cancel request to @${r.other.username}`}
                        onPress={() => tapCancel(r)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.xBtn, arming && { borderColor: Colors.hard, backgroundColor: Colors.hardTint }, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <X size={14} color={arming ? Colors.hard : Colors.text2} />
                      </Pressable>
                    </View>
                  }
                />
              );
            })}
          </View>
        ) : null}
        {friends.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{`FRIENDS (${friends.length})`}</SectionLabel>
            {friends.map((r) => (
              <PersonRow key={r.other.id} person={r.other} right={<ChevronRight size={18} color={Colors.text3} />} />
            ))}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <Screen>
      <NavHeader title="Friends" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 18, paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="search by username"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search by username"
              containerStyle={{ flex: 1 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add friends by QR code"
              onPress={() => router.push('/qr')}
              style={({ pressed }) => [styles.qrBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <QrCode size={22} color={Colors.accent} />
            </Pressable>
          </View>
          {error ? <T variant="monoSm" color={Colors.hard}>{error}</T> : null}
          {searchMode ? <View style={styles.section}>{renderSearch()}</View> : renderLists()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrBtn: {
    width: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  xBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
});
