import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { BadgeCheck, Check, ChevronDown, Copy, ExternalLink, RefreshCw, Timer } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { ApiError, fetchChallengeProblems, rerollChallenges, verifyLeetCodeLink } from '../lib/api';
import { ChallengeProblem } from '../types';
import { Button, DifficultyPill, Group, Loading, NavHeader, Screen, SectionLabel, T } from '../components/ui';

// LeetCode moves this around; these are the labels as of late 2026
const BIO_STEPS: [string, string][] = [
  ['Open leetcode.com/profile', 'signed in, on the “Basic Info” tab'],
  ['Find “Summary”, tap Edit', 'paste the code anywhere in it, then Save'],
  ['Come back and tap Check', 'delete the code afterwards if you like'],
];

function Row({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: Colors.border }}>
      {children}
    </View>
  );
}

export default function Verify() {
  const { link, session, verified, refreshProfile, linkGitHub } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeProblem[] | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const [showBio, setShowBio] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState<'check' | 'github' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  const github = session?.user.identities?.find((i) => i.provider === 'github')?.identity_data?.user_name as string | undefined;

  useEffect(() => {
    if (link) fetchChallengeProblems(link.challenge_slugs).then(setChallenges).catch(() => setChallenges([]));
  }, [link?.challenge_slugs.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = useCallback(async (manual: 'check' | 'github' | null) => {
    if (busy.current || verified) return;
    busy.current = true;
    if (manual) setChecking(manual);
    setMessage(null);
    try {
      const res = await verifyLeetCodeLink();
      if (res.verified) await refreshProfile();
      else if (manual === 'github') setMessage(`Your LeetCode profile doesn’t list github.com/${github ?? 'you'} yet. Add it under Basic Info → GitHub, then check again.`);
      else if (manual) setMessage('Nothing yet. Post a challenge problem, or save the code in your Summary and check again.');
    } catch (e) {
      if (manual) setMessage(e instanceof ApiError ? e.message : 'Couldn’t check right now. Try again.');
    } finally {
      busy.current = false;
      setChecking(null);
    }
  }, [verified, refreshProfile, github]);

  // While the code steps are open, check every 10s so people can just come back from LeetCode
  useFocusEffect(
    useCallback(() => {
      if (!showBio) return;
      const id = setInterval(() => check(null), 10_000);
      return () => clearInterval(id);
    }, [check, showBio]),
  );

  const connectGitHub = async () => {
    setMessage(null);
    if (!github) {
      try {
        if (!(await linkGitHub())) return;
      } catch (e: any) {
        setMessage(e?.message ?? 'GitHub didn’t connect. Try again.');
        return;
      }
    }
    await check('github');
  };

  const reroll = async () => {
    setRerolling(true);
    try {
      const res = await rerollChallenges();
      setChallenges(res.challenges);
      await refreshProfile();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Couldn’t swap the problems. Try again.');
    } finally {
      setRerolling(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link.verify_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!link) return <Screen><NavHeader title="Verify" /><Loading /></Screen>;

  if (verified) {
    return (
      <Screen edges={['top', 'bottom']}>
        <NavHeader title="Verify" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <BadgeCheck size={44} color={Colors.accent} />
          <T variant="title" style={{ textAlign: 'center' }}>@{link.leetcode_username} is verified</T>
          <T variant="body" style={{ textAlign: 'center' }}>Your profile now mirrors your LeetCode stats.</T>
        </View>
        <View style={{ padding: 20 }}><Button title="Done" onPress={() => router.back()} /></View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <NavHeader title="Verify" />
      <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }}>
        <T variant="title">Prove @{link.leetcode_username} is yours</T>
        <T variant="body">Until you do, your profile says unverified and your LeetCode stats stay hidden. Most people never need this screen: their first post does it.</T>

        <SectionLabel right={
          <Pressable accessibilityRole="button" accessibilityLabel="Different problems" onPress={reroll} disabled={rerolling} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: rerolling ? 0.5 : 1 }}>
            <RefreshCw size={12} color={Colors.text3} />
            <T variant="monoSm">different ones</T>
          </Pressable>
        }>Fastest: post one</SectionLabel>
        <Group>
          {challenges === null ? <View style={{ padding: 16 }}><Loading /></View> : challenges.map((p, i) => (
            <Pressable
              key={p.slug}
              accessibilityRole="link"
              accessibilityLabel={`Open ${p.title} on LeetCode`}
              onPress={() => Linking.openURL(`https://leetcode.com/problems/${p.slug}/`)}
            >
              <Row last={i === challenges.length - 1}>
                <T variant="monoMedium" style={{ width: 40, fontSize: 12 }} color={Colors.text3}>#{p.frontend_id}</T>
                <T variant="medium" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{p.title}</T>
                <DifficultyPill difficulty={p.difficulty} />
                <ExternalLink size={14} color={Colors.text3} />
              </Row>
            </Pressable>
          ))}
        </Group>
        <T variant="monoSm" style={{ marginTop: -6 }}>// solve any one after now, then post it. only you can submit on your account</T>
        <Button title="Start timer" icon={(c) => <Timer size={18} color={c} />} onPress={() => router.push('/timer')} />

        <SectionLabel>Or: GitHub</SectionLabel>
        <T variant="bodySm">
          {github
            ? `If your LeetCode profile lists github.com/${github}, that’s proof enough.`
            : 'If your LeetCode profile lists your GitHub, connect the same account here.'}
        </T>
        <Button title={github ? 'Check GitHub' : 'Verify with GitHub'} variant="secondary" loading={checking === 'github'} onPress={connectGitHub} />

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showBio }} onPress={() => setShowBio((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 }}>
          <View style={{ flex: 1 }}><SectionLabel>Or: a code in your profile</SectionLabel></View>
          <ChevronDown size={16} color={Colors.text3} style={{ transform: [{ rotate: showBio ? '180deg' : '0deg' }] }} />
        </Pressable>
        {showBio ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 16, paddingRight: 12, borderRadius: Radius.lg, backgroundColor: Colors.accentTint, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accentLine }}>
              <T selectable style={{ flex: 1, fontFamily: Fonts.monoSemiBold, fontSize: 20, letterSpacing: 0.5 }} color={Colors.accent}>{link.verify_code}</T>
              <Pressable accessibilityRole="button" onPress={copy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderStrong }}>
                {copied ? <Check size={14} color={Colors.accent} /> : <Copy size={14} color={Colors.text} />}
                <T variant="monoMedium" style={{ fontSize: 12 }}>{copied ? 'copied' : 'copy'}</T>
              </Pressable>
            </View>
            <Group>
              {BIO_STEPS.map(([title, sub], i) => (
                <Row key={title} last={i === BIO_STEPS.length - 1}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderStrong }}>
                    <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 11 }} color={Colors.text2}>{i + 1}</T>
                  </View>
                  <View style={{ gap: 2, flex: 1 }}>
                    <T variant="medium" style={{ fontSize: 14 }}>{title}</T>
                    <T variant="monoSm" style={{ fontSize: 11 }}>{sub}</T>
                  </View>
                </Row>
              ))}
            </Group>
            <Button title="Open LeetCode ↗" variant="secondary" onPress={() => Linking.openURL('https://leetcode.com/profile/')} />
            <Button title="Check" loading={checking === 'check'} onPress={() => check('check')} />
          </>
        ) : null}

        {message ? <T accessibilityLiveRegion="polite" variant="bodySm" color={Colors.text2}>{message}</T> : null}
      </ScrollView>
    </Screen>
  );
}
