import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Camera, Check, Copy, Share as ShareIcon } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { parseLeetUpCode, profileUrl, USERNAME_RE } from '../lib/friends';
import { Avatar, Button, EmptyState, Input, Loading, NavHeader, Screen, Segmented, T } from '../components/ui';

type Tab = 'code' | 'scan';

const BAD_CODE_MS = 2000;

function openProfile(username: string) {
  router.push({ pathname: '/u/[username]', params: { username } });
}

function MyCode() {
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  if (!profile) return <Loading />;
  const url = profileUrl(profile.username);

  const copy = async () => {
    setNote(null);
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote('Couldn’t copy the link.');
    }
  };

  const share = async () => {
    setNote(null);
    try {
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
    } catch {
      // Web without navigator.share lands here
      setNote('Sharing isn’t available here. Copy the link instead.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingBottom: 32 }}>
      <View style={styles.card}>
        <Avatar name={profile.display_name} url={profile.avatar_url} size={56} ring={Colors.accent} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T variant="h2" numberOfLines={1}>{profile.display_name}</T>
          <T variant="monoSm">@{profile.username}</T>
        </View>
        <View style={styles.qrFrame} accessibilityRole="image" accessibilityLabel={`QR code for ${url}`}>
          <QRCode value={url} size={200} color={Colors.bg} backgroundColor={Colors.text} ecl="H" />
          <View style={styles.qrBadgeWrap} pointerEvents="none">
            <View style={styles.qrBadge}>
              <T style={{ fontFamily: Fonts.monoBold, fontSize: 18, lineHeight: 22 }} color={Colors.accentInk}>{'>_'}</T>
            </View>
          </View>
        </View>
        <T variant="mono">leetup.app/u/{profile.username}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Share link" variant="secondary" onPress={share} icon={(c) => <ShareIcon size={18} color={c} />} style={{ flex: 1 }} />
        <Button
          title={copied ? 'Copied' : 'Copy link'}
          variant="secondary"
          onPress={copy}
          icon={(c) => (copied ? <Check size={18} color={Colors.accent} /> : <Copy size={18} color={c} />)}
          style={{ flex: 1 }}
        />
      </View>
      {note ? <T variant="monoSm" color={Colors.hard} style={{ textAlign: 'center' }}>{note}</T> : null}
      <T variant="monoSm" style={{ textAlign: 'center' }}>{'// friends scan this from their friends tab'}</T>
    </ScrollView>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const top = pos[0] === 't';
  const left = pos[1] === 'l';
  return (
    <View
      style={[
        styles.corner,
        top ? { top: 0, borderTopWidth: 5 } : { bottom: 0, borderBottomWidth: 5 },
        left ? { left: 0, borderLeftWidth: 5 } : { right: 0, borderRightWidth: 5 },
        top && left ? { borderTopLeftRadius: 14 } : null,
        top && !left ? { borderTopRightRadius: 14 } : null,
        !top && left ? { borderBottomLeftRadius: 14 } : null,
        !top && !left ? { borderBottomRightRadius: 14 } : null,
      ]}
    />
  );
}

function NativeScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(true);
  const [badCode, setBadCode] = useState(false);
  const handled = useRef(false);
  const badTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera runs only while this screen is focused; coming back re-arms scanning
  useFocusEffect(
    useCallback(() => {
      handled.current = false;
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  useEffect(() => () => { if (badTimer.current) clearTimeout(badTimer.current); }, []);

  const onScan = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const username = parseLeetUpCode(data);
    if (username) {
      handled.current = true;
      setBadCode(false);
      openProfile(username);
      return;
    }
    setBadCode(true);
    if (badTimer.current) clearTimeout(badTimer.current);
    badTimer.current = setTimeout(() => setBadCode(false), BAD_CODE_MS);
  };

  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <EmptyState
        icon={<Camera size={28} color={Colors.accent} />}
        title="Scan a friend’s code"
        body={permission.canAskAgain ? 'LeetUp needs your camera to read QR codes. Nothing is recorded.' : 'Camera access is off. Turn it on in Settings to scan codes.'}
        action={
          permission.canAskAgain ? (
            <Button title="Allow camera" pill onPress={requestPermission} style={{ marginTop: 8 }} />
          ) : (
            <Button title="Open Settings" pill onPress={() => Linking.openSettings()} style={{ marginTop: 8 }} />
          )
        }
      />
    );
  }

  return (
    <View style={styles.cameraFrame}>
      {active ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      ) : null}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.viewfinder}>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
        </View>
        <View style={[styles.hintPill, badCode && { borderColor: Colors.hard }]}>
          <T variant="mono" color={badCode ? Colors.hard : Colors.text}>{badCode ? 'That’s not a LeetUp code' : 'point at a friend’s code'}</T>
        </View>
      </View>
    </View>
  );
}

function WebScanner() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    const raw = value.trim();
    const username = parseLeetUpCode(raw) ?? raw.replace(/^@/, '').toLowerCase();
    if (!USERNAME_RE.test(username)) {
      setError('Usernames are 3–20 letters, numbers or _.');
      return;
    }
    setError(null);
    openProfile(username);
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <EmptyState icon={<Camera size={28} color={Colors.text3} />} title="Scan on your phone" body="Scanning works in the LeetUp app on your phone." />
      <Input
        value={value}
        onChangeText={(t) => { setValue(t); setError(null); }}
        placeholder="username or leetup.app link"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={go}
        accessibilityLabel="Username or profile link"
      />
      {error ? <T variant="monoSm" color={Colors.hard}>{error}</T> : null}
      <Button title="Open profile" onPress={go} disabled={!value.trim()} />
    </ScrollView>
  );
}

export default function AddByQr() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'scan' ? 'scan' : 'code');

  return (
    <Screen edges={['top', 'bottom']}>
      <NavHeader title="Add friends" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <Segmented<Tab>
          options={[
            { value: 'code', label: 'my code' },
            { value: 'scan', label: 'scan' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'code' ? <MyCode /> : Platform.OS === 'web' ? <WebScanner /> : <NativeScanner />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 16,
    padding: 24,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  qrFrame: { padding: 16, borderRadius: 18, backgroundColor: Colors.text },
  qrBadgeWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  qrBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderWidth: 4,
    borderColor: Colors.text,
  },
  cameraFrame: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 20 },
  viewfinder: { width: 210, height: 210 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: Colors.accent },
  hintPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
});
