import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { deviceTimezone } from '../../lib/format';
import { Button, Input, Screen, SectionLabel, T } from '../../components/ui';
import { StepHeader } from '../../components/StepHeader';

const USERNAME = /^[a-z0-9_]{3,20}$/;

export default function ProfileSetup() {
  const { session, refreshProfile, signOut } = useAuth();
  const suggested = (session?.user.email?.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const [username, setUsername] = useState(suggested.length >= 3 ? suggested : '');
  const [displayName, setDisplayName] = useState((session?.user.user_metadata?.full_name as string | undefined) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const u = username.trim().toLowerCase();
    if (!USERNAME.test(u)) return setError('Usernames are 3–20 characters: lowercase letters, numbers and underscores.');
    if (!displayName.trim()) return setError('Add the name your friends know you by.');
    setBusy(true);
    const { error: insertError } = await supabase.from('profiles').insert({
      id: session!.user.id,
      username: u,
      display_name: displayName.trim().slice(0, 40),
      timezone: deviceTimezone(),
    });
    setBusy(false);
    if (insertError?.code === '23505') return setError(`@${u} is taken. Try another.`);
    if (insertError) return setError(insertError.message);
    await refreshProfile();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <StepHeader step={1} onBack={signOut} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 14, padding: 20 }} keyboardShouldPersistTaps="handled">
          <T variant="title">Set up your profile</T>
          <T variant="body">This is how friends find and add you. Your LeetCode account comes next.</T>
          <SectionLabel>Username</SectionLabel>
          <Input
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            placeholder="your_username"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            accessibilityLabel="Username"
            right={<T variant="monoSm">{username.length}/20</T>}
          />
          <SectionLabel>Display name</SectionLabel>
          <Input
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Edward Chan"
            autoCapitalize="words"
            maxLength={40}
            accessibilityLabel="Display name"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          {error ? <T variant="bodySm" color={Colors.hard}>{error}</T> : null}
          <View style={{ flex: 1 }} />
          <Button title="Continue →" onPress={save} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
