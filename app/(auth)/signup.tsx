import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, username);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Success', 'Check your email to confirm your account!');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>LeetReal</Text>
        <Text style={styles.tagline}>Join the grind.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={Colors.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="LeetCode Username (optional)"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkHighlight}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  logo: {
    fontSize: FontSize.hero,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  tagline: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  form: {
    gap: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  linkHighlight: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
