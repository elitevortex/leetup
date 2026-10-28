import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getLeetCodeLink, syncProfile } from './api';
import { deviceTimezone } from './format';
import { LeetCodeLink, Profile } from '../types';

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = 'google' | 'github';

// Where a signed-in person is in onboarding; the router follows this.
// Linked-but-unverified LeetCode accounts are "ready": the first post verifies them.
export type AuthStatus = 'loading' | 'signedOut' | 'needsProfile' | 'needsLeetCode' | 'ready';

interface AuthContextType {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  link: LeetCodeLink | null;
  verified: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  // Adds GitHub to an existing account, so a LeetCode profile listing that GitHub verifies it
  linkGitHub: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [link, setLink] = useState<LeetCodeLink | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // Which user the current profile state belongs to, so a new session never reads a stale "no profile"
  const [profileFor, setProfileFor] = useState<string | null | undefined>(undefined);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const [{ data }, l] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      getLeetCodeLink().catch(() => null),
    ]);
    setProfile(data);
    setLink(l);
    setProfileFor(uid);
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
      setLink(null);
      setProfileFor(null);
      return;
    }
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
    if (!sessionLoaded || (session && profileFor !== session.user.id)) return 'loading';
    if (!session) return 'signedOut';
    if (!profile) return 'needsProfile';
    if (!link) return 'needsLeetCode';
    return 'ready';
  }, [sessionLoaded, session, profileFor, profile, link]);

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

  // Sign in with (or, with `link`, add) an OAuth provider. Returns false if the person backed out.
  const oauth = useCallback(async (provider: OAuthProvider, addToAccount = false): Promise<boolean> => {
    const name = provider === 'github' ? 'GitHub' : 'Google';
    const start = addToAccount ? supabase.auth.linkIdentity.bind(supabase.auth) : supabase.auth.signInWithOAuth.bind(supabase.auth);
    if (Platform.OS === 'web') {
      const { error } = await start({ provider, options: { redirectTo: window.location.origin } });
      if (error) throw error;
      return true;
    }
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await start({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error) throw error;
    if (!data.url) throw new Error(`${name} sign-in didn’t start. Try again.`);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return false;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error(`${name} sign-in didn’t finish. Try again.`);
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return true;
  }, []);

  const signInWithGoogle = useCallback(async () => { await oauth('google'); }, [oauth]);
  const signInWithGitHub = useCallback(async () => { await oauth('github'); }, [oauth]);
  const linkGitHub = useCallback(() => oauth('github', true), [oauth]);

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
    setLink(null);
  }, []);

  const value = useMemo(
    () => ({
      status, session, userId, profile, link, verified: !!link?.verified_at,
      signInWithApple, signInWithGoogle, signInWithGitHub, linkGitHub, signInWithEmail, signUpWithEmail, signOut, refreshProfile,
    }),
    [status, session, userId, profile, link, signInWithApple, signInWithGoogle, signInWithGitHub, linkGitHub, signInWithEmail, signUpWithEmail, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
