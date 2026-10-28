import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { Solve } from '../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile, user } = useAuth();
  const [recentSolves, setRecentSolves] = useState<Solve[]>([]);
  const [friendUsername, setFriendUsername] = useState('');
  const [friendCount, setFriendCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [solvesRes, friendsRes] = await Promise.all([
      supabase
        .from('solves')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('friendships')
        .select('id', { count: 'exact' })
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted'),
    ]);

    setRecentSolves(solvesRes.data || []);
    setFriendCount(friendsRes.count || 0);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refreshProfile()]);
    setRefreshing(false);
  };

  const addFriend = async () => {
    if (!user || !friendUsername.trim()) return;
    setAddingFriend(true);

    const { data: friendProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', friendUsername.toLowerCase().trim())
      .single();

    if (!friendProfile) {
      Alert.alert('Not found', 'No user with that username');
      setAddingFriend(false);
      return;
    }

    if (friendProfile.id === user.id) {
      Alert.alert('Error', "You can't add yourself");
      setAddingFriend(false);
      return;
    }

    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: friendProfile.id,
      status: 'accepted', // Auto-accept for now
    });

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already friends', 'You are already connected with this user');
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Added!', `You and @${friendUsername} are now friends`);
      setFriendUsername('');
      fetchData();
    }
    setAddingFriend(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const difficultyColor = (d: string) => {
    if (d === 'Easy') return Colors.easy;
    if (d === 'Medium') return Colors.medium;
    return Colors.hard;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.display_name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name || 'User'}</Text>
        <Text style={styles.username}>@{profile?.username || 'unknown'}</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile?.total_solves || 0}</Text>
          <Text style={styles.statLabel}>Total Solves</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile?.current_streak || 0}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{friendCount}</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>
      </View>

      {/* Add Friend */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Friend</Text>
        <View style={styles.addFriendRow}>
          <TextInput
            style={styles.addFriendInput}
            placeholder="Username"
            placeholderTextColor={Colors.textMuted}
            value={friendUsername}
            onChangeText={setFriendUsername}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.addFriendButton, addingFriend && { opacity: 0.6 }]}
            onPress={addFriend}
            disabled={addingFriend}
          >
            <Text style={styles.addFriendButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Solves */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Solves</Text>
        {recentSolves.length === 0 ? (
          <Text style={styles.emptyText}>No solves yet. Hit the timer!</Text>
        ) : (
          recentSolves.map((solve) => (
            <View key={solve.id} style={styles.solveRow}>
              <View style={styles.solveInfo}>
                <Text style={styles.solveName}>
                  {solve.problem_number ? `#${solve.problem_number} ` : ''}
                  {solve.problem_name}
                </Text>
                <Text style={[styles.solveDifficulty, { color: difficultyColor(solve.difficulty) }]}>
                  {solve.difficulty} · {formatTime(solve.time_seconds)} · {solve.submissions} sub{solve.submissions !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.background,
  },
  displayName: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  username: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  addFriendRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addFriendInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFriendButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  addFriendButtonText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  solveRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  solveInfo: {
    gap: Spacing.xs,
  },
  solveName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  solveDifficulty: {
    fontSize: FontSize.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  signOutButton: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
  },
  signOutText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
