import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { fetchLeaderboard } from '../../lib/api';
import { fetchAllTimeLeaderboard, isoWeek } from '../../lib/profile';
import { LeaderboardRow } from '../../types';
import { Avatar, Button, DifficultyPill, EmptyState, Loading, Screen, SectionLabel, Segmented, T, TabHeader } from '../../components/ui';

type Mode = 'week' | 'all';

function RankRow({ row, rank, self }: { row: LeaderboardRow; rank: number; self: boolean }) {
  const rankColor = rank === 1 ? Colors.medium : self ? Colors.accent : Colors.text3;
  const points = `${row.points.toLocaleString('en-US')} pts`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rank ${rank}, ${row.display_name}${self ? ' (you)' : ''}, ${points}, ${row.solves} solves`}
      onPress={() => router.push({ pathname: '/u/[username]', params: { username: row.username } })}
      style={({ pressed }) => [styles.row, self && styles.selfRow, { opacity: pressed ? 0.85 : 1 }]}
    >
      <T style={{ fontFamily: Fonts.monoBold, fontSize: 15, width: 26 }} color={rankColor}>{String(rank).padStart(2, '0')}</T>
      <Avatar name={row.display_name} url={row.avatar_url} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="name" numberOfLines={1}>{row.display_name}</T>
        <T variant="monoSm" numberOfLines={1}>@{row.username}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 15, lineHeight: 20 }} color={Colors.text}>{points}</T>
        <T style={{ fontFamily: Fonts.mono, fontSize: 11 }} color={Colors.text3}>{row.solves} {row.solves === 1 ? 'solve' : 'solves'}</T>
      </View>
    </Pressable>
  );
}

export default function Ranks() {
  const { userId } = useAuth();
  const [mode, setMode] = useState<Mode>('week');
  const [boards, setBoards] = useState<Record<Mode, LeaderboardRow[] | null>>({ week: null, all: null });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = mode === 'week' ? await fetchLeaderboard() : await fetchAllTimeLeaderboard(userId);
      setBoards((prev) => ({ ...prev, [mode]: rows }));
      setError(null);
    } catch {
      setError('couldn’t load the board. pull to retry.');
      setBoards((prev) => ({ ...prev, [mode]: prev[mode] ?? [] }));
    }
  }, [mode, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const rows = boards[mode];
  const onlyYou = !!rows && !error && rows.every((r) => r.id === userId);

  return (
    <Screen>
      <TabHeader title="Ranks" />
      <ScrollView
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
      >
        <SectionLabel>{`Week ${isoWeek()} · resets Mon 00:00`}</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={styles.legend}><DifficultyPill difficulty="Easy" /><T style={styles.legendText} color={Colors.text2}>= 1</T></View>
          <View style={styles.legend}><DifficultyPill difficulty="Medium" /><T style={styles.legendText} color={Colors.text2}>= 3</T></View>
          <View style={styles.legend}><DifficultyPill difficulty="Hard" /><T style={styles.legendText} color={Colors.text2}>= 5</T></View>
        </View>
        <Segmented<Mode>
          options={[{ value: 'week', label: 'this week' }, { value: 'all', label: 'all time' }]}
          value={mode}
          onChange={setMode}
        />
        {error ? <T variant="monoSm" color={Colors.hard}>{error}</T> : null}
        {!rows ? (
          <Loading />
        ) : (
          <View style={{ gap: 8 }}>
            {rows.map((r, i) => <RankRow key={r.id} row={r} rank={i + 1} self={r.id === userId} />)}
          </View>
        )}
        {onlyYou ? (
          <EmptyState
            icon={<Trophy size={28} color={Colors.text3} />}
            title="Add friends to compete"
            body="Friends you add show up here, ranked by points."
            action={<Button title="Find friends" pill onPress={() => router.push('/friends')} />}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  selfRow: { backgroundColor: Colors.accentTint, borderColor: Colors.accentLine },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16 },
});
