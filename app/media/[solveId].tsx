import { ComponentRef, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Colors, Fonts } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { fetchSolve } from '../../lib/api';
import { SolveMedia } from '../../types';
import { IconButton, Loading, T } from '../../components/ui';

// Each video owns its player so hooks stay valid; only the visible page plays
function VideoPage({ url, active, width }: { url: string; active: boolean; width: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return <VideoView player={player} style={{ width, height: '100%' }} contentFit="contain" nativeControls />;
}

export default function MediaViewer() {
  const params = useLocalSearchParams<{ solveId: string; index?: string }>();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // undefined while loading, null when there's nothing to show
  const [media, setMedia] = useState<SolveMedia[] | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const positioned = useRef(false);

  useEffect(() => {
    if (!userId || !params.solveId) return;
    fetchSolve(params.solveId, userId)
      .then((s) => {
        const items = s?.media.filter((m) => !!m.url) ?? [];
        if (items.length === 0) return setMedia(null);
        const start = Math.min(Math.max(0, Number(params.index) || 0), items.length - 1);
        setPage(start);
        setMedia(items);
      })
      .catch(() => setMedia(null));
  }, [params.solveId, params.index, userId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  // contentOffset isn't honoured everywhere, so jump to the opening page once laid out
  const openAtStart = () => {
    if (positioned.current) return;
    positioned.current = true;
    scroller.current?.scrollTo({ x: page * width, animated: false });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (positioned.current && media && next !== page && next >= 0 && next < media.length) setPage(next);
  };

  const closeButton = (
    <IconButton label="Close" onPress={close} style={[styles.close, { top: insets.top + 8 }]}>
      <X size={20} color={Colors.text} />
    </IconButton>
  );

  if (media === undefined) {
    return (
      <View style={styles.root}>
        <Loading />
        {closeButton}
      </View>
    );
  }

  if (media === null) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <T variant="body" style={{ textAlign: 'center' }}>This media isn’t available.</T>
        {closeButton}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={openAtStart}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {media.map((m, i) =>
          m.kind === 'video' ? (
            <VideoPage key={m.id} url={m.url!} active={i === page} width={width} />
          ) : (
            <Image
              key={m.id}
              source={{ uri: m.url }}
              style={{ width, height: '100%' }}
              contentFit="contain"
              transition={150}
              accessibilityLabel={`Photo ${i + 1} of ${media.length}`}
            />
          ),
        )}
      </ScrollView>
      {closeButton}
      <View style={[styles.counter, { top: insets.top + 8 }]} accessibilityLiveRegion="polite">
        <T style={{ fontFamily: Fonts.monoMedium, fontSize: 13 }} color={Colors.text}>{`${page + 1} / ${media.length}`}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', left: 16 },
  counter: { position: 'absolute', right: 16, height: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 19, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
});
