import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { Solve } from '../../types';
import { SolveCard } from '../../components/SolveCard';
import { Colors, Spacing, FontSize } from '../../constants/theme';

export default function FeedScreen() {
  const { user } = useAuth();
  const [solves, setSolves] = useState<Solve[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    if (!user) return;

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

    // Get solves from friends + self
    const { data: solvesData } = await supabase
      .from('solves')
      .select(`
        *,
        profile:profiles!user_id(*),
        likes:likes(count)
      `)
      .in('user_id', friendIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (solvesData) {
      // Check which solves the current user has liked
      const solveIds = solvesData.map((s) => s.id);
      const { data: myLikes } = await supabase
        .from('likes')
        .select('solve_id')
        .eq('user_id', user.id)
        .in('solve_id', solveIds);

      const likedSet = new Set((myLikes || []).map((l) => l.solve_id));

      const enriched: Solve[] = solvesData.map((s: any) => ({
        ...s,
        profile: s.profile,
        likes_count: s.likes?.[0]?.count || 0,
        liked_by_me: likedSet.has(s.id),
      }));

      setSolves(enriched);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFeed();
    setRefreshing(false);
  };

  const toggleLike = async (solveId: string, liked: boolean) => {
    if (!user) return;

    setSolves((prev) =>
      prev.map((s) =>
        s.id === solveId
          ? {
              ...s,
              liked_by_me: !liked,
              likes_count: (s.likes_count || 0) + (liked ? -1 : 1),
            }
          : s
      )
    );

    if (liked) {
      await supabase
        .from('likes')
        .delete()
        .eq('user_id', user.id)
        .eq('solve_id', solveId);
    } else {
      await supabase
        .from('likes')
        .insert({ user_id: user.id, solve_id: solveId });
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={solves}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SolveCard solve={item} onToggleLike={toggleLike} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={solves.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No solves yet</Text>
            <Text style={styles.emptySubtitle}>
              Add friends or start solving to see activity here
            </Text>
          </View>
        }
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
  list: {
    paddingVertical: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
