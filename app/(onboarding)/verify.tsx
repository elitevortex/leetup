import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { useAuth } from '../../lib/auth-context';
import { ApiError, getLeetCodeLink, verifyLeetCodeLink } from '../../lib/api';
import { Button, Group, Loading, Screen, T } from '../../components/ui';
import { StepHeader } from '../../components/StepHeader';
import { TrustLine } from '../../components/TrustLine';

const STEPS: [string, string][] = [
  ['Open your LeetCode profile', 'leetcode.com/profile'],
  ['Paste into “Summary”', 'anywhere in it works'],
  ['Save and come back here', 'we’ll check automatically'],
];

export default function Verify() {
  const { refreshProfile } = useAuth();
  const [link, setLink] = useState<{ leetcode_username: string; verify_code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<'none' | 'missing'>('none');
  const busy = useRef(false);

  useEffect(() => {
    getLeetCodeLink().then((l) => {
      if (!l) router.replace('/(onboarding)/connect');
      else setLink(l);
    });
  }, []);

  const check = useCallback(async (manual: boolean) => {
    if (busy.current || verified) return;
    busy.current = true;
    if (manual) setChecking(true);
    setError(null);
    try {
      const res = await verifyLeetCodeLink();
      if (res.verified) setVerified(true);
      else if (manual) setLastCheck('missing');
    } catch (e) {
      if (manual) setError(e instanceof ApiError ? e.message : 'Couldn’t check right now. Try again.');
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [verified]);

  // Check every 10 seconds while this screen is open, so people can just come back from LeetCode
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => check(false), 10_000);
      return () => clearInterval(id);
    }, [check]),
  );

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

  if (!link) return <Screen><Loading /></Screen>;

  return (
    <Screen edges={['top', 'bottom']}>
      <StepHeader step={3} onBack={() => router.replace('/(onboarding)/connect')} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 14, padding: 20 }}>
        <T variant="title">Prove it’s yours</T>
        <T variant="body">Paste this code into your LeetCode profile summary, save, then come back. You can delete it once you’re verified.</T>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingLeft: 18, paddingRight: 14, borderRadius: Radius.lg, backgroundColor: Colors.accentTint, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accentLine }}>
          <T selectable style={{ flex: 1, fontFamily: Fonts.monoSemiBold, fontSize: 24, letterSpacing: 0.5 }} color={Colors.accent}>{link.verify_code}</T>
          <Pressable accessibilityRole="button" onPress={copy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderStrong }}>
            {copied ? <Check size={14} color={Colors.accent} /> : <Copy size={14} color={Colors.text} />}
            <T variant="monoMedium" style={{ fontSize: 12 }}>{copied ? 'copied' : 'copy'}</T>
          </Pressable>
        </View>

        <Group>
          {STEPS.map(([title, sub], i) => (
            <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: i < STEPS.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderStrong }}>
                <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: 11 }} color={Colors.text2}>{i + 1}</T>
              </View>
              <View style={{ gap: 2 }}>
                <T variant="medium" style={{ fontSize: 14 }}>{title}</T>
                <T variant="monoSm" style={{ fontSize: 11 }}>{sub}</T>
              </View>
            </View>
          ))}
        </Group>

        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: verified ? Colors.accentTint : Colors.surface, borderWidth: 1, borderColor: verified ? Colors.accentLine : Colors.border }}>
          {verified ? <Check size={18} color={Colors.accent} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.medium }} />}
          <T variant="monoMedium" style={{ flex: 1, fontSize: 12 }} color={verified ? Colors.text : Colors.text2}>
            {verified
              ? `verified as @${link.leetcode_username} · you can delete the code now`
              : lastCheck === 'missing'
                ? `code not found on @${link.leetcode_username} yet · saved it?`
                : 'waiting for code… checking every 10s'}
          </T>
        </View>
        {error ? <T variant="bodySm" color={Colors.hard}>{error}</T> : null}

        <View style={{ flex: 1, minHeight: 16 }} />
        {verified ? (
          <Button title="Continue to leetup →" onPress={() => refreshProfile()} />
        ) : (
          <>
            <Button title="Open LeetCode ↗" variant="secondary" onPress={() => Linking.openURL('https://leetcode.com/profile/')} />
            <Button title="Check now" onPress={() => check(true)} loading={checking} />
          </>
        )}
        <TrustLine />
      </ScrollView>
    </Screen>
  );
}
