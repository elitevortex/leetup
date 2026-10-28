import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, Check, EyeOff, Flag, Trash2 } from 'lucide-react-native';
import { Colors, Fonts } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { blockUser, deleteSolve, reportComment, reportSolve, ReportReason } from '../lib/api';
import { hideSolve } from '../lib/social';
import { Button, Group, GroupRow, Input, T } from '../components/ui';

const CONFIRM_MS = 4000;

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'spam' },
  { value: 'harassment', label: 'harassment' },
  { value: 'inappropriate', label: 'inappropriate' },
  { value: 'cheating', label: 'cheating' },
  { value: 'other', label: 'other' },
];

type Step = 'menu' | 'reasons' | 'done';

export default function Report() {
  const params = useLocalSearchParams<{ solveId?: string; commentId?: string; ownerId: string; ownerName: string; ownerUsername: string; title: string }>();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [confirming, setConfirming] = useState<'delete' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComment = !params.solveId && !!params.commentId;
  const noun = isComment ? 'comment' : 'post';
  const ownPost = !!params.solveId && params.ownerId === userId;

  // A pending second tap quietly expires
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const leaveToHome = () => {
    router.dismissAll();
    router.replace('/(tabs)');
  };

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (busy || !params.solveId) return;
    if (confirming !== 'delete') return setConfirming('delete');
    setConfirming(null);
    run(async () => {
      await deleteSolve(params.solveId!);
      leaveToHome();
    }, 'Couldn’t delete this post. Try again.');
  };

  const onBlock = () => {
    if (busy || !userId) return;
    if (confirming !== 'block') return setConfirming('block');
    setConfirming(null);
    run(async () => {
      await blockUser(userId, params.ownerId);
      leaveToHome();
    }, `Couldn’t block @${params.ownerUsername}. Try again.`);
  };

  const onHide = () => {
    if (busy || !params.solveId) return;
    run(async () => {
      await hideSolve(params.solveId!);
      close();
    }, 'Couldn’t hide this post. Try again.');
  };

  const onReport = () => {
    if (busy || !reason) return;
    run(async () => {
      const note = details.trim() || undefined;
      if (params.solveId) await reportSolve(params.solveId, reason, note);
      else if (params.commentId) await reportComment(params.commentId, reason, note);
      setStep('done');
    }, 'Couldn’t send your report. Try again.');
  };

  let content;
  if (step === 'done') {
    content = (
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
          <Check size={20} color={Colors.accent} strokeWidth={2.5} />
          <T variant="medium" style={{ flex: 1 }}>Thanks, we’ll review it.</T>
        </View>
        <Button title="Done" onPress={close} />
      </View>
    );
  } else if (step === 'reasons') {
    content = (
      <View style={{ gap: 12 }}>
        <T variant="comment">{'// why are you reporting this?'}</T>
        <Group>
          {REASONS.map((r, i) => {
            const on = reason === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityLabel={r.label}
                accessibilityState={{ checked: on }}
                onPress={() => setReason(r.value)}
                style={({ pressed }) => [styles.reason, i === REASONS.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: Colors.surface2 }]}
              >
                <T style={{ flex: 1, fontFamily: on ? Fonts.monoMedium : Fonts.mono, fontSize: 14 }} color={on ? Colors.text : Colors.text2}>{r.label}</T>
                {on ? <Check size={18} color={Colors.accent} strokeWidth={2.5} /> : null}
              </Pressable>
            );
          })}
        </Group>
        <Input value={details} onChangeText={setDetails} placeholder="details (optional)" maxLength={500} accessibilityLabel="Report details" />
        <Button title={`Report ${noun}`} variant="danger" onPress={onReport} disabled={!reason} loading={busy} />
      </View>
    );
  } else if (ownPost) {
    content = (
      <Group>
        <GroupRow
          icon={<Trash2 size={18} color={Colors.hard} />}
          label={confirming === 'delete' ? 'Tap again to delete' : 'Delete this post'}
          onPress={onDelete}
          danger
          last
        />
      </Group>
    );
  } else {
    content = (
      <Group>
        <GroupRow icon={<Flag size={18} color={Colors.hard} />} label={`Report this ${noun}`} onPress={() => { setConfirming(null); setStep('reasons'); }} danger />
        <GroupRow
          icon={<Ban size={18} color={Colors.hard} />}
          label={confirming === 'block' ? `Tap again to block @${params.ownerUsername}` : `Block @${params.ownerUsername}`}
          onPress={onBlock}
          danger
          last={isComment}
        />
        {!isComment ? <GroupRow icon={<EyeOff size={18} color={Colors.text2} />} label="Hide from my feed" onPress={onHide} last /> : null}
      </Group>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={[StyleSheet.absoluteFill, styles.scrim]} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={{ gap: 4, alignItems: 'center' }}>
            <T variant="name" style={{ fontSize: 17 }} numberOfLines={1}>{`${params.ownerName}’s ${isComment ? 'comment' : 'solve'}`}</T>
            {params.title ? <T variant="monoSm" numberOfLines={1}>{params.title}</T> : null}
          </View>
          {content}
          {error ? <T variant="bodySm" color={Colors.hard} accessibilityLiveRegion="polite">{error}</T> : null}
          {step !== 'done' ? <Button title="Cancel" variant="secondary" onPress={close} /> : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(9, 9, 11, 0.75)' },
  sheet: { gap: 16, paddingTop: 10, paddingHorizontal: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderColor: Colors.borderStrong },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.borderStrong },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
});
