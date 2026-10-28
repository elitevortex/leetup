import { ComponentRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { Button, Input, NavHeader, Screen, Segmented, T } from '../../components/ui';

type Mode = 'signin' | 'signup';

export default function EmailAuth() {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Passwords need at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmail(email, password);
      else {
        const { needsConfirmation } = await signUpWithEmail(email, password);
        if (needsConfirmation) setNotice('Check your inbox to confirm your email, then sign in.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <NavHeader title="Email" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} keyboardShouldPersistTaps="handled">
          <Segmented
            options={[{ value: 'signin', label: 'sign in' }, { value: 'signup', label: 'create account' }]}
            value={mode}
            onChange={(m) => { setMode(m); setError(null); setNotice(null); }}
          />
          <View style={{ gap: 10 }}>
            <Input
              placeholder="email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel="Email"
            />
            <Input
              ref={passwordRef}
              placeholder="password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              returnKeyType="go"
              onSubmitEditing={submit}
              accessibilityLabel="Password"
            />
          </View>
          {error ? <T variant="bodySm" color={Colors.hard}>{error}</T> : null}
          {notice ? <T variant="bodySm" color={Colors.accent}>{notice}</T> : null}
          <Button title={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
