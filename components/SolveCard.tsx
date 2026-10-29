import { memo } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ellipsis, Heart, MessageCircle, Play, Share as ShareIcon } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { formatDuration, formatTimestamp, pace, shortLang } from '../lib/format';
import { DIFFICULTY_POINTS, FeedSolve, PersonSummary, SolveMedia } from '../types';
import { Avatar, AvatarStack, Card, DifficultyPill, T } from './ui';

// Close to Strava's action icons
const ICON = 26;

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

function MediaTile({ solveId, media, index, style }: { solveId: string; media: SolveMedia; index: number; style: object }) {
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={media.kind === 'video' ? 'Play video' : 'Open photo'}
      onPress={() => router.push({ pathname: '/media/[solveId]', params: { solveId, index: String(index) } })}
      style={[styles.tile, style]}
    >
      {media.kind === 'photo' && media.url ? (
        <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : null}
      {media.kind === 'video' ? (
        <>
          <View style={styles.play}>
            <Play size={16} color={Colors.text} fill={Colors.text} />
          </View>
          {media.duration_seconds ? (
            <View style={styles.duration}>
              <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10 }} color={Colors.text}>{formatDuration(media.duration_seconds)}</T>
            </View>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

// Explicit rows rather than a wrapping row: a percentage width plus aspectRatio inside flexWrap
// gets the wrong height on iOS, which cropped photos and left a gap under them
export function MediaGrid({ solveId, media }: { solveId: string; media: SolveMedia[] }) {
  if (media.length === 0) return null;
  if (media.length === 1) return <MediaTile solveId={solveId} media={media[0]} index={0} style={{ width: '100%', aspectRatio: 4 / 3 }} />;
  const rows: SolveMedia[][] = [];
  for (let i = 0; i < media.length; i += 2) rows.push(media.slice(i, i + 2));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map((m, i) => <MediaTile key={m.id} solveId={solveId} media={m} index={r * 2 + i} style={{ flex: 1, aspectRatio: 1 }} />)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

// Optimistic like/unlike, keeping the liker faces in step
export function applyLike(solve: FeedSolve, me: PersonSummary, liked: boolean): FeedSolve {
  const others = solve.likers.filter((p) => p.id !== me.id);
  return {
    ...solve,
    liked_by_me: liked,
    likes_count: Math.max(0, solve.likes_count + (liked ? 1 : -1)),
    likers: liked ? [me, ...others].slice(0, 3) : others,
  };
}

// Up to three liker faces and "You and 3 others liked this"
export function LikeSummary({ solve, ring = Colors.surface }: { solve: FeedSolve; ring?: string }) {
  const line = likeLine(solve);
  if (!line) return null;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <AvatarStack people={solve.likers.map((p) => ({ id: p.id, name: p.display_name, url: p.avatar_url }))} max={3} size={26} ring={ring} />
      <T variant="bodySm" style={{ flex: 1 }} color={Colors.text2} numberOfLines={1}>{line}</T>
    </View>
  );
}

function likeLine(solve: FeedSolve): string | null {
  const n = solve.likes_count;
  if (n === 0) return null;
  const rest = (k: number) => `${k} ${k === 1 ? 'other' : 'others'}`;
  if (solve.liked_by_me) return n === 1 ? 'You liked this' : `You and ${rest(n - 1)} liked this`;
  const first = solve.likers[0]?.display_name.split(' ')[0];
  if (!first) return `${n} liked this`;
  return n === 1 ? `${first} liked this` : `${first} and ${rest(n - 1)} liked this`;
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

  const likes = likeLine(solve);

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

      {likes || solve.comments_count > 0 ? (
        <View style={styles.summary}>
          {likes ? <LikeSummary solve={solve} /> : <View style={{ flex: 1 }} />}
          {solve.comments_count > 0 ? (
            <Pressable accessibilityRole="button" onPress={open} hitSlop={8}>
              <T variant="bodySm" color={highlightComments ? Colors.accent : Colors.text2}>
                {solve.comments_count} {solve.comments_count === 1 ? 'comment' : 'comments'}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={solve.liked_by_me ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: solve.liked_by_me }}
          onPress={() => onToggleLike?.(solve)}
          hitSlop={8}
          style={styles.action}
        >
          <Heart size={ICON} color={solve.liked_by_me ? Colors.like : Colors.text} fill={solve.liked_by_me ? Colors.like : 'transparent'} strokeWidth={2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comments, ${solve.comments_count}`} onPress={open} hitSlop={8} style={styles.action}>
          <MessageCircle size={ICON} color={highlightComments ? Colors.accent : Colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={share} hitSlop={8} style={styles.action}>
          <ShareIcon size={ICON} color={Colors.text} strokeWidth={2} />
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
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -16, marginBottom: -6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
});
