import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { BadgeCheck, Camera, Check, ChevronLeft, Code, Image as ImageIcon, Play, Search, X } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { ApiError, fetchFeedState, postSolve, searchProblems, uploadSolveMedia } from '../lib/api';
import { formatDuration } from '../lib/format';
import { saveTimer } from '../lib/timer';
import { DIFFICULTY_POINTS, Problem } from '../types';
import { Button, DifficultyPill, IconButton, Input, Screen, SectionLabel, T } from '../components/ui';

const MAX_MEDIA = 4;
const MAX_VIDEO_SECONDS = 60;
const RETRY_EVERY_MS = 8000;
const MAX_AUTO_RETRIES = 6;

interface PickedMedia {
  uri: string;
  kind: 'photo' | 'video';
  mimeType: string;
  duration: number | null;
}

type Status = { kind: 'idle' } | { kind: 'posting' } | { kind: 'waiting'; message: string; attempt: number } | { kind: 'error'; message: string };

export default function PostSolve() {
  const { userId, link, verified, refreshProfile } = useAuth();
  const params = useLocalSearchParams<{ started_at?: string; ended_at?: string; active?: string }>();
  const timed = !!(params.started_at && params.ended_at);
  const activeSeconds = params.active ? Number(params.active) : null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Problem[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Problem | null>(null);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [mediaError, setMediaError] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only promise an unlock when the database says home is still locked today
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetchFeedState().then((state) => setLocked(!state.unlocked)).catch(() => undefined);
  }, []);

  // Debounced search against the synced LeetCode problem list
  useEffect(() => {
    if (picked || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(() => {
      searchProblems(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(id);
  }, [query, picked]);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const addMedia = async (source: 'camera' | 'library') => {
    setMediaError(null);
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) return;
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setMediaError(source === 'camera' ? 'Allow camera access in Settings to take photos.' : 'Allow photo access in Settings to attach media.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoMaxDuration: MAX_VIDEO_SECONDS,
      allowsMultipleSelection: source === 'library',
      selectionLimit: remaining,
    };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled) return;
    const next: PickedMedia[] = [];
    for (const a of res.assets) {
      const kind = a.type === 'video' ? 'video' : 'photo';
      const duration = a.duration ? a.duration / 1000 : null;
      if (kind === 'video' && duration && duration > MAX_VIDEO_SECONDS + 0.5) {
        setMediaError('Videos can be up to 60 seconds.');
        continue;
      }
      next.push({ uri: a.uri, kind, duration, mimeType: a.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') });
    }
    setMedia((m) => [...m, ...next].slice(0, MAX_MEDIA));
  };

  const submit = async (attempt = 0) => {
    if (!picked || !userId) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setStatus(attempt === 0 ? { kind: 'posting' } : { kind: 'waiting', message: 'Checking LeetCode again…', attempt });
    try {
      const { solve, verified_now, verify_held } = await postSolve({
        problem_slug: picked.slug,
        ...(timed ? { started_at: params.started_at, ended_at: params.ended_at, active_seconds: activeSeconds ?? undefined } : {}),
        note: note.trim() || undefined,
      });
      if (media.length) {
        try {
          await uploadSolveMedia(userId, solve.id, media);
        } catch {
          // The solve is posted; media can be retried later without blocking the unlock
        }
      }
      await saveTimer(null);
      if (verified_now) refreshProfile().catch(() => undefined);
      router.replace({
        pathname: '/celebrate',
        params: {
          solveId: solve.id,
          num: String(picked.frontend_id),
          title: picked.title,
          difficulty: picked.difficulty,
          points: `+${DIFFICULTY_POINTS[picked.difficulty]}`,
          ...(verify_held ? { verifyHeld: '1' } : {}),
        },
      });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network', 'Couldn’t post. Check your connection and try again.');
      // LeetCode can take a few seconds to show a fresh submission, so keep looking for a bit
      if (err.code === 'no_accepted_submission' && attempt < MAX_AUTO_RETRIES) {
        setStatus({ kind: 'waiting', message: err.message, attempt: attempt + 1 });
        retryTimer.current = setTimeout(() => submit(attempt + 1), RETRY_EVERY_MS);
      } else {
        setStatus({ kind: 'error', message: err.message });
      }
    }
  };

  const discard = async () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    await saveTimer(null);
    router.replace('/(tabs)');
  };

  const elapsed = activeSeconds ?? (timed ? Math.round((Date.parse(params.ended_at!) - Date.parse(params.started_at!)) / 1000) : null);
  const busy = status.kind === 'posting' || status.kind === 'waiting';

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton label="Back to timer" onPress={() => (timed ? router.replace('/timer') : router.back())}>
          <ChevronLeft size={20} color={Colors.text} />
        </IconButton>
        <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 22, letterSpacing: -0.4 }} color={Colors.text}>
          <T style={{ fontFamily: Fonts.monoMedium, fontSize: 22 }} color={Colors.accent}>~/</T>post
        </T>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="label" style={{ fontSize: 11, letterSpacing: 1.1 }}>{timed ? 'SOLVED IN' : 'UNTIMED SOLVE'}</T>
              <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 48, lineHeight: 52, letterSpacing: -2.4 }} color={timed ? Colors.text : Colors.text3}>
                {elapsed != null ? formatDuration(elapsed) : '--:--'}
              </T>
            </View>
            <View style={styles.pts}>
              <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 12, letterSpacing: 0.7 }} color={Colors.accent}>
                {picked ? `+${DIFFICULTY_POINTS[picked.difficulty]}` : '+–'} PTS
              </T>
            </View>
          </View>

          <SectionLabel>Problem</SectionLabel>
          {!verified && link ? (
            // Any problem submitted since they linked proves the account; nothing else to do
            <View style={styles.verifyNote}>
              <BadgeCheck size={16} color={Colors.accent} />
              <T variant="bodySm" style={{ flex: 1 }} color={Colors.text}>This post verifies @{link.leetcode_username}.</T>
            </View>
          ) : null}
          <View style={{ zIndex: 5 }}>
            {picked ? (
              <View style={styles.picked}>
                <Check size={18} color={Colors.accent} strokeWidth={2.25} />
                <T variant="monoMedium" color={Colors.text3}>#{picked.frontend_id}</T>
                <T variant="name" style={{ flex: 1 }} numberOfLines={1}>{picked.title}</T>
                <Pressable accessibilityRole="button" accessibilityLabel="Change problem" onPress={() => { setPicked(null); setQuery(''); }} style={styles.change}>
                  <T variant="monoSm" style={{ fontSize: 11 }} color={Colors.text2}>change</T>
                </Pressable>
              </View>
            ) : (
              <>
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="search by name or number"
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Search LeetCode problems"
                  right={searching ? <ActivityIndicator size="small" color={Colors.text3} /> : <Search size={18} color={Colors.text3} />}
                />
                {results.length > 0 ? (
                  <View style={styles.results} accessibilityRole="list">
                    {results.map((p) => (
                      <Pressable
                        key={p.slug}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.frontend_id} ${p.title}, ${p.difficulty}`}
                        onPress={() => { setPicked(p); setResults([]); }}
                        style={({ pressed }) => [styles.result, pressed && { backgroundColor: Colors.surface2 }]}
                      >
                        <T variant="monoMedium" style={{ width: 44, fontSize: 12 }} color={Colors.text3}>#{p.frontend_id}</T>
                        <T variant="medium" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{p.title}</T>
                        <DifficultyPill difficulty={p.difficulty} />
                      </Pressable>
                    ))}
                    <T variant="monoSm" style={{ paddingHorizontal: 14, paddingVertical: 8, fontSize: 11 }}>// from leetcode's problem list · tap to pick</T>
                  </View>
                ) : null}
              </>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><SectionLabel>Difficulty · auto</SectionLabel></View>
            {picked ? <DifficultyPill difficulty={picked.difficulty} /> : <T variant="monoSm" style={{ fontSize: 11 }}>pick a problem first</T>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><SectionLabel>Lang · auto</SectionLabel></View>
            <Code size={14} color={Colors.syntaxBlue} />
            <T variant="monoSm" style={{ fontSize: 11 }}>from your submission</T>
          </View>

          <SectionLabel right={<T variant="monoSm">{media.length} / {MAX_MEDIA}</T>}>Media (optional)</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {media.map((m, i) => (
              <View key={m.uri} style={styles.tile}>
                {m.kind === 'photo' ? <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
                  <>
                    <Play size={18} color={Colors.text} fill={Colors.text} />
                    {m.duration ? <View style={styles.dur}><T style={{ fontFamily: Fonts.monoMedium, fontSize: 10 }} color={Colors.text}>{formatDuration(m.duration)}</T></View> : null}
                  </>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => setMedia((all) => all.filter((_, j) => j !== i))} style={styles.remove} hitSlop={8}>
                  <X size={12} color={Colors.text} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
            {media.length < MAX_MEDIA ? (
              <>
                {Platform.OS !== 'web' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Take a photo or video" onPress={() => addMedia('camera')} style={[styles.tile, styles.add]}>
                    <Camera size={22} color={Colors.accent} />
                    <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }} color={Colors.text2}>CAMERA</T>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Choose from library" onPress={() => addMedia('library')} style={[styles.tile, styles.add]}>
                  <ImageIcon size={22} color={Colors.accent} />
                  <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }} color={Colors.text2}>LIBRARY</T>
                </Pressable>
              </>
            ) : null}
          </View>
          {mediaError ? <T variant="bodySm" color={Colors.hard}>{mediaError}</T> : null}

          <Input value={note} onChangeText={setNote} placeholder="note (optional) · hashmap, one pass" maxLength={280} accessibilityLabel="Note" />

          {status.kind === 'waiting' || status.kind === 'error' ? (
            <View accessibilityLiveRegion="polite" style={[styles.notice, status.kind === 'error' && { borderColor: Colors.hardLine, backgroundColor: Colors.hardTint }]}>
              {status.kind === 'waiting' ? <ActivityIndicator size="small" color={Colors.medium} /> : null}
              <T variant="bodySm" style={{ flex: 1 }} color={status.kind === 'error' ? Colors.text : Colors.text2}>
                {status.kind === 'waiting' ? `Waiting for your Accepted submission to show up on LeetCode… (try ${status.attempt} of ${MAX_AUTO_RETRIES})` : status.message}
              </T>
            </View>
          ) : null}

          <View style={{ flex: 1, minHeight: 12 }} />
          <Button
            title={status.kind === 'error' ? 'Try again' : !verified ? 'Post solve · verify' : timed && locked ? 'Post solve · unlock home' : 'Post solve'}
            onPress={() => submit(0)}
            loading={busy}
            disabled={!picked}
          />
          <Pressable accessibilityRole="button" onPress={discard} style={{ alignSelf: 'center', padding: 6 }}>
            <T variant="mono" color={Colors.text3}>discard</T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  pts: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, backgroundColor: Colors.accentTint },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, borderRadius: Radius.md, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
  change: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderStrong },
  results: { position: 'absolute', top: 54, left: 0, right: 0, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderStrong, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tile: { flex: 1, maxWidth: '24%', aspectRatio: 1, borderRadius: Radius.md, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  add: { backgroundColor: Colors.surface, borderStyle: 'dashed', gap: 8 },
  remove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: Colors.bg },
  verifyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.accentTint, borderWidth: 1, borderColor: Colors.accentLine },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
});
