import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { BadgeCheck, Check } from 'lucide-react-native';
import { Colors, Fonts } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { ApiError, startLeetCodeLink } from '../../lib/api';
import { LeetCodePreview } from '../../types';
import { Avatar, Button, Card, Input, Screen, SectionLabel, T } from '../../components/ui';
import { StepHeader } from '../../components/StepHeader';
import { TrustLine } from '../../components/TrustLine';

function Count({ value, label, fg, bg, line }: { value: number; label: string; fg: string; bg: string; line: string }) {
  return (
    <View style={{ flex: 1, gap: 4, padding: 12, borderRadius: 10, backgroundColor: bg, borderWidth: 1, borderColor: line }}>
      <T variant="bigStat" style={{ fontSize: 20 }}>{value}</T>
      <T style={{ fontFamily: Fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }} color={fg}>{label}</T>
    </View>
  );
}

export default function Connect() {
  const { signOut, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [preview, setPreview] = useState<LeetCodePreview | null>(null);
  const [verified, setVerified] = useState(false);
  const [contested, setContested] = useState(false);
  const [entering, setEntering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    const u = username.trim();
    if (!u) return;
    setError(null);
    setPreview(null);
    setBusy(true);
    try {
      const res = await startLeetCodeLink(u);
      setPreview(res.preview);
      setVerified(res.verified);
      setContested(res.contested);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <StepHeader step={2} onBack={signOut} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 14, padding: 20 }} keyboardShouldPersistTaps="handled">
          <T variant="title">Connect your LeetCode</T>
          <T variant="body">Your profile mirrors your real LeetCode stats. Jump straight in: your feed is open all day today, and your first post proves the account is yours.</T>

          <SectionLabel>LeetCode username</SectionLabel>
          <Input
            prompt={false}
            value={username}
            onChangeText={(t) => { setUsername(t); setPreview(null); }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={find}
            accessibilityLabel="LeetCode username"
            containerStyle={preview ? { borderColor: Colors.accent } : null}
            style={{ fontFamily: Fonts.monoMedium }}
            right={preview ? <Check size={18} color={Colors.accent} /> : null}
          />
          <T variant="monoSm" style={{ marginTop: -6 }}>leetcode.com/u/{username.trim() || 'username'}</T>

          {error ? <T variant="bodySm" color={Colors.hard}>{error}</T> : null}

          {preview ? (
            <>
              <SectionLabel>Is this you?</SectionLabel>
              <Card style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={preview.realName || preview.username} url={preview.avatar} size={48} />
                  <View style={{ gap: 2, flex: 1 }}>
                    <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 16 }} color={Colors.text}>{preview.username}</T>
                    <T variant="monoSm">
                      {[preview.realName, preview.ranking ? `rank ${preview.ranking.toLocaleString('en-US')}` : null].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                </View>
                {verified ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <BadgeCheck size={16} color={Colors.accent} />
                    <T variant="monoMedium" style={{ fontSize: 12 }} color={Colors.accent}>verified via GitHub</T>
                  </View>
                ) : contested ? (
                  <T variant="bodySm" color={Colors.medium}>
                    Someone else on LeetUp claimed this account with a post. If it’s yours, verify with GitHub or the profile code from Home to take it back.
                  </T>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Count value={preview.easy} label="EASY" fg={Colors.easy} bg={Colors.easyTint} line={Colors.easyLine} />
                  <Count value={preview.medium} label="MEDIUM" fg={Colors.medium} bg={Colors.mediumTint} line={Colors.mediumLine} />
                  <Count value={preview.hard} label="HARD" fg={Colors.hard} bg={Colors.hardTint} line={Colors.hardLine} />
                </View>
              </Card>
            </>
          ) : null}

          <View style={{ flex: 1, minHeight: 16 }} />
          {preview ? (
            <>
              <Button
                title="Yes, that’s me →"
                loading={entering}
                onPress={async () => {
                  setEntering(true);
                  // The link now exists, so a refresh moves the router into the app
                  await refreshProfile().finally(() => setEntering(false));
                }}
              />
              <T variant="monoSm" style={{ textAlign: 'center' }}>not you? check the spelling</T>
            </>
          ) : (
            <Button title="Find my account" onPress={find} loading={busy} disabled={!username.trim()} />
          )}
          <TrustLine />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

