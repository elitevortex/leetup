import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { LeaderboardEntry, DIFFICULTY_POINTS } from '../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    if (!user) return;

    // Get start of current week (Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);

    // Get friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    const friendIds = (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    friendIds.push(user.id);

    // Get this week's solves for friends
    const { data: solves } = await supabase
      .from('solves')
      .select('user_id, difficulty, time_seconds')
      .in('user_id', friendIds)
      .gte('created_at', weekStart.toISOString());

    // Get profiles for friends
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', friendIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, p])
    );

    // Aggregate
    const statsMap = new Map<
      string,
      { count: number; weighted: number; totalTime: number }
    >();

    for (const solve of solves || []) {
      const existing = statsMap.get(solve.user_id) || {
        count: 0,
        weighted: 0,
        totalTime: 0,
      };
      existing.count += 1;
      existing.weighted +=
        DIFFICULTY_POINTS[solve.difficulty as keyof typeof DIFFICULTY_POINTS] || 1;
      existing.totalTime += solve.time_seconds;
      statsMap.set(solve.user_id, existing);
    }

    // Build leaderboard
    const leaderboard: LeaderboardEntry[] = friendIds
      .map((id) => {
        const profile = profileMap.get(id);
        const stats = statsMap.get(id) || { count: 0, weighted: 0, totalTime: 0 };
        return {
          user_id: id,
          username: profile?.username || 'unknown',
          display_name: profile?.display_name || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          solve_count: stats.count,
          weighted_score: stats.weighted,
          avg_time_seconds:
            stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
          rank: 0,
        };
      })
      .sort((a, b) => b.weighted_score - a.weighted_score || b.solve_count - a.solve_count)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    setEntries(leaderboard);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeaderboard();
    setRefreshing(false);
  };

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const renderEntry = ({ item }: { item: LeaderboardEntry }) => {
    const isMe = item.user_id === user?.id;

    return (
      <View style={[styles.entry, isMe && styles.entryHighlight]}>
        <Text style={styles.rank}>{getRankDisplay(item.rank)}</Text>
        <View style={styles.entryInfo}>
          <Text style={[styles.entryName, isMe && styles.entryNameMe]}>
            {item.display_name}
            {isMe ? ' (you)' : ''}
          </Text>
          <Text style={styles.entryUsername}>@{item.username}</Text>
        </View>
        <View style={styles.entryStats}>
          <Text style={styles.entryScore}>{item.weighted_score} pts</Text>
          <Text style={styles.entrySolves}>
            {item.solve_count} solve{item.solve_count !== 1 ? 's' : ''} · avg{' '}
            {formatTime(item.avg_time_seconds)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>This Week</Text>
        <Text style={styles.headerSubtitle}>
          Resets every Monday · Ranked by weighted score
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.user_id}
        renderItem={renderEntry}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  list: {
    paddingVertical: Spacing.sm,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
  },
  entryHighlight: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  rank: {
    fontSize: FontSize.xl,
    width: 48,
    textAlign: 'center',
    color: Colors.text,
  },
  entryInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  entryName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  entryNameMe: {
    color: Colors.primary,
  },
  entryUsername: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  entryStats: {
    alignItems: 'flex-end',
  },
  entryScore: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  entrySolves: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
