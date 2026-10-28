import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Solve, DIFFICULTY_COLORS, DIFFICULTY_POINTS } from '../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface SolveCardProps {
  solve: Solve;
  onToggleLike: (solveId: string, currentlyLiked: boolean) => void;
}

export function SolveCard({ solve, onToggleLike }: SolveCardProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const points = DIFFICULTY_POINTS[solve.difficulty];
  const diffColor = DIFFICULTY_COLORS[solve.difficulty];

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarText}>
            {(solve.profile?.display_name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.displayName}>
            {solve.profile?.display_name || 'Unknown'}
          </Text>
          <Text style={styles.timeAgo}>{timeAgo(solve.created_at)}</Text>
        </View>
        <View style={[styles.difficultyBadge, { backgroundColor: diffColor }]}>
          <Text style={styles.difficultyText}>{solve.difficulty}</Text>
        </View>
      </View>

      {/* Problem Info */}
      <View style={styles.body}>
        <Text style={styles.problemName}>
          {solve.problem_number ? `#${solve.problem_number} ` : ''}
          {solve.problem_name}
        </Text>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatTime(solve.time_seconds)}</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{solve.submissions}</Text>
            <Text style={styles.statLabel}>Submissions</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: diffColor }]}>+{points}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          {solve.runtime_percentile && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {Math.round(solve.runtime_percentile)}%
              </Text>
              <Text style={styles.statLabel}>Speed</Text>
            </View>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => onToggleLike(solve.id, solve.liked_by_me || false)}
        >
          <Text style={styles.likeIcon}>{solve.liked_by_me ? '❤️' : '🤍'}</Text>
          <Text
            style={[
              styles.likeCount,
              solve.liked_by_me && { color: Colors.like },
            ]}
          >
            {solve.likes_count || 0}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingBottom: 0,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  displayName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  timeAgo: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  difficultyText: {
    color: '#000',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  body: {
    padding: Spacing.md,
  },
  problemName: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingTop: 0,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  likeIcon: {
    fontSize: 18,
  },
  likeCount: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
