import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Ban } from 'lucide-react-native';
import { Colors } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { fetchBlocked, unblockUser } from '../lib/api';
import { PersonSummary } from '../types';
import { Avatar, Button, EmptyState, Loading, NavHeader, Screen, SmallButton, T } from '../components/ui';

export default function Blocked() {
  const { userId } = useAuth();
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setFailed(false);
    fetchBlocked().then(setPeople).catch(() => setFailed(true));
  };

  useEffect(load, []);

  const unblock = async (person: PersonSummary) => {
    if (!userId || busy) return;
    setBusy(person.id);
    setError(null);
    try {
      await unblockUser(userId, person.id);
      setPeople((prev) => prev?.filter((p) => p.id !== person.id) ?? prev);
    } catch {
      setError(`couldn’t unblock @${person.username}. try again.`);
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (failed && !people) {
    body = (
      <EmptyState
        title="Couldn’t load blocked users"
        body="Check your connection and try again."
        action={<Button title="Try again" pill variant="secondary" onPress={load} />}
      />
    );
  } else if (!people) {
    body = <Loading />;
  } else {
    body = (
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={error ? <T variant="monoSm" color={Colors.hard} style={{ paddingVertical: 8 }}>{error}</T> : undefined}
        ListEmptyComponent={
          <EmptyState icon={<Ban size={28} color={Colors.text3} />} title="No one blocked" body="People you block can’t see your posts or profile." />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar name={item.display_name} url={item.avatar_url} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="name" numberOfLines={1}>{item.display_name}</T>
              <T variant="monoSm" numberOfLines={1}>@{item.username}</T>
            </View>
            <SmallButton title={busy === item.id ? 'Unblocking…' : 'Unblock'} disabled={!!busy} onPress={() => unblock(item)} />
          </View>
        )}
      />
    );
  }

  return (
    <Screen>
      <NavHeader title="Blocked users" />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
});
