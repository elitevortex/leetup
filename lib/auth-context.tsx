import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncProfile } from './api';
import { deviceTimezone } from './format';
import { Profile } from '../types';

WebBrowser.maybeCompleteAuthSession();

// Where a signed-in person is in onboarding; the router follows this
export type AuthStatus = 'loading' | 'signedOut' | 'needsProfile' | 'needsLeetCode' | 'ready';

interface AuthContextType {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(data);
    setProfileLoaded(true);
    return data;
  }, []);

  const refreshProfile = useCallback(async () => (userId ? loadProfile(userId) : null), [userId, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }
    setProfileLoaded(false);
    loadProfile(userId);
  }, [userId, loadProfile]);

  // Keep "today" in the person's own time zone, and their LeetCode stats fresh
  useEffect(() => {
    if (!profile) return;
    const tz = deviceTimezone();
    if (tz !== profile.timezone) {
      supabase.from('profiles').update({ timezone: tz }).eq('id', profile.id).then(() => undefined);
    }
    if (profile.leetcode_username) syncProfile().catch(() => undefined);
  }, [profile?.id, profile?.leetcode_username]); // eslint-disable-line react-hooks/exhaustive-deps

  const status: AuthStatus = useMemo(() => {
    if (!sessionLoaded || (session && !profileLoaded)) return 'loading';
    if (!session) return 'signedOut';
    if (!profile) return 'needsProfile';
    if (!profile.leetcode_username) return 'needsLeetCode';
    return 'ready';
  }, [sessionLoaded, session, profileLoaded, profile]);

  const signInWithApple = useCallback(async () => {
    // Apple gets the hashed nonce, Supabase the raw one, so a stolen token can't be replayed
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw error;
      return;
    }
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google sign-in didn’t finish. Try again.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ status, session, userId, profile, signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, refreshProfile }),
    [status, session, userId, profile, signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
