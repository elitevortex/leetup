import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { EyeOff, Timer } from 'lucide-react-native';
import { Colors, Radius } from '../constants/theme';
import { untilMidnight } from '../lib/format';
import { Teaser } from '../types';
import { Avatar, Button, DifficultyPill, T } from './ui';

// Shapes of today's posts, built only from teaser data (the real posts are withheld by the database)
function GhostCard({ teaser }: { teaser: Teaser }) {
  return (
    <View style={styles.ghost}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={teaser.display_name} url={teaser.avatar_url} />
        <View style={{ flex: 1, gap: 6 }}>
          <T variant="name">{teaser.display_name}</T>
          <View style={[styles.bar, { width: 90, height: 10 }]} />
        </View>
        <DifficultyPill difficulty={teaser.difficulty} />
      </View>
      <View style={[styles.bar, { width: '70%', height: 18 }]} />
      <View style={styles.stats}>
        {['', '', `+${teaser.points}`, ''].map((v, i) => (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            {v ? <T variant="stat" color={Colors.accent}>{v}</T> : <View style={[styles.bar, { width: 40, height: 14 }]} />}
            <View style={[styles.bar, { width: 30, height: 8 }]} />
          </View>
        ))}
      </View>
      {teaser.media_count > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: Math.min(2, teaser.media_count) }).map((_, i) => (
            <View key={i} style={[styles.bar, { flex: 1, aspectRatio: 1, borderRadius: Radius.md, backgroundColor: i ? '#1f2a26' : '#22202a' }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function LockedPanel({ teasers }: { teasers: Teaser[] }) {
  return (
    <View style={styles.panel}>
      <View style={{ gap: 12 }} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {teasers.slice(0, 3).map((t) => (
          <GhostCard key={t.solve_id} teaser={t} />
        ))}
      </View>
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.overlay]}>
        <View style={styles.eye}>
          <EyeOff size={28} color={Colors.text} />
        </View>
        <T variant="h2" style={{ fontSize: 24, lineHeight: 30, marginTop: 4 }}>Post to view</T>
        <T variant="bodySm" style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
          {teasers.length > 0 ? 'Solve one problem to see today’s\nsolves, clips & code.' : 'Be the first of your friends to solve today.'}
        </T>
        <Button
          title="Start a solve"
          pill
          onPress={() => router.push('/timer')}
          icon={(c) => <Timer size={18} color={c} />}
          style={{ marginTop: 8 }}
        />
        <T variant="monoSm" style={{ fontSize: 11 }}>resets at midnight · {untilMidnight()} left</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 380, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, overflow: 'hidden' },
  ghost: { gap: 14, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  bar: { borderRadius: 4, backgroundColor: Colors.surface2 },
  stats: { flexDirection: 'row', padding: 12, borderRadius: 10, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: 'rgba(9, 9, 11, 0.42)' },
  eye: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderStrong },
});

