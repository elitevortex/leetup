import { memo } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ellipsis, Heart, MessageCircle, Play, Share as ShareIcon } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { formatDuration, formatTimestamp, pace, shortLang } from '../lib/format';
import { DIFFICULTY_POINTS, FeedSolve, SolveMedia } from '../types';
import { Avatar, Card, DifficultyPill, T } from './ui';

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="stat" color={accent ? Colors.accent : Colors.text}>{value}</T>
      <T variant="label">{label}</T>
    </View>
  );
}

export function SolveStats({ solve }: { solve: Pick<FeedSolve, 'time_seconds' | 'language' | 'problem'> }) {
  return (
    <View style={styles.stats}>
      <Stat value={solve.time_seconds != null ? formatDuration(solve.time_seconds) : 'untimed'} label="Time" />
      <Stat value={shortLang(solve.language)} label="Lang" />
      <Stat value={`+${DIFFICULTY_POINTS[solve.problem.difficulty]}`} label="Points" accent />
      <Stat value={pace(solve.time_seconds, solve.problem.difficulty)} label="Pace" />
    </View>
  );
}

export function MediaGrid({ solveId, media }: { solveId: string; media: SolveMedia[] }) {
  if (media.length === 0) return null;
  const single = media.length === 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {media.map((m, index) => (
        <Pressable
          key={m.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={m.kind === 'video' ? 'Play video' : 'Open photo'}
          onPress={() => router.push({ pathname: '/media/[solveId]', params: { solveId, index: String(index) } })}
          style={[styles.tile, single ? { width: '100%', aspectRatio: 16 / 10 } : { width: '48.6%', aspectRatio: 1 }]}
        >
          {m.kind === 'photo' && m.url ? (
            <Image source={{ uri: m.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : null}
          {m.kind === 'video' ? (
            <>
              <View style={styles.play}>
                <Play size={16} color={Colors.text} fill={Colors.text} />
              </View>
              {m.duration_seconds ? (
                <View style={styles.duration}>
                  <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10 }} color={Colors.text}>{formatDuration(m.duration_seconds)}</T>
                </View>
              ) : null}
            </>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function SolveCardBase({
  solve,
  onToggleLike,
  onMore,
  pressable = true,
  highlightComments,
}: {
  solve: FeedSolve;
  onToggleLike?: (solve: FeedSolve) => void;
  onMore?: (solve: FeedSolve) => void;
  pressable?: boolean;
  highlightComments?: boolean;
}) {
  const open = pressable ? () => router.push({ pathname: '/solve/[id]', params: { id: solve.id } }) : undefined;
  const share = () =>
    Share.share({
      message: `${solve.profile.display_name} solved #${solve.problem.frontend_id} ${solve.problem.title}${
        solve.time_seconds ? ` in ${formatDuration(solve.time_seconds)}` : ''
      } on LeetUp`,
    });

  return (
    <Card onPress={open} style={{ gap: 14 }}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push({ pathname: '/u/[username]', params: { username: solve.profile.username } })} style={styles.who}>
          <Avatar name={solve.profile.display_name} url={solve.profile.avatar_url} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="name" numberOfLines={1}>{solve.profile.display_name}</T>
            <T variant="monoSm">{formatTimestamp(solve.created_at)}</T>
          </View>
        </Pressable>
        <DifficultyPill difficulty={solve.problem.difficulty} />
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => onMore(solve)}>
            <Ellipsis size={20} color={Colors.text3} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <T style={{ fontFamily: Fonts.monoMedium, fontSize: 14 }} color={Colors.text3}>#{solve.problem.frontend_id}</T>
        <T variant="cardTitle" style={{ flex: 1 }}>{solve.problem.title}</T>
      </View>
      {solve.note ? <T variant="monoSm">{`// ${solve.note}`}</T> : null}

      <SolveStats solve={solve} />
      <MediaGrid solveId={solve.id} media={solve.media} />

      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={solve.liked_by_me ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: solve.liked_by_me }}
          onPress={() => onToggleLike?.(solve)}
          hitSlop={8}
          style={[styles.action, { justifyContent: 'flex-start' }]}
        >
          <Heart size={18} color={solve.liked_by_me ? Colors.like : Colors.text2} fill={solve.liked_by_me ? Colors.like : 'transparent'} />
          <T style={styles.count} color={Colors.text2}>{solve.likes_count}</T>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${solve.comments_count} comments`} onPress={open} hitSlop={8} style={styles.action}>
          <MessageCircle size={18} color={highlightComments ? Colors.accent : Colors.text2} />
          <T style={styles.count} color={highlightComments ? Colors.accent : Colors.text2}>{solve.comments_count}</T>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={share} hitSlop={8} style={[styles.action, { justifyContent: 'flex-end' }]}>
          <ShareIcon size={18} color={Colors.text2} />
        </Pressable>
      </View>
    </Card>
  );
}

export const SolveCard = memo(SolveCardBase);

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  tile: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: Colors.bg },
  foot: { flexDirection: 'row', alignItems: 'center' },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  count: { fontFamily: Fonts.monoMedium, fontSize: 13 },
});
