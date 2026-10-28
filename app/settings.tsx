import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Ban, ChevronRight, Code, FileText, Mail, Shield, User } from 'lucide-react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../lib/auth-context';
import { deleteAccount, updateProfile } from '../lib/api';
import { Button, Group, GroupRow, Input, NavHeader, Screen, SectionLabel, SmallButton, T } from '../components/ui';

const SUPPORT_EMAIL = 'support@leetup.app';

const chevron = <ChevronRight size={18} color={Colors.text3} />;
const icon = (Icon: typeof User) => <Icon size={18} color={Colors.text2} />;

function open(url: string, onFail: () => void) {
  Linking.openURL(url).catch(onFail);
}

function NameEditor({ onDone }: { onDone: () => void }) {
  const { userId, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const save = async () => {
    if (!userId || !trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(userId, { display_name: trimmed.slice(0, 40) });
      await refreshProfile();
      onDone();
    } catch {
      setError('couldn’t save. try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.editor}>
      <T variant="label">Display name</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Input
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholder="your name"
          accessibilityLabel="Display name"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          containerStyle={{ flex: 1, paddingVertical: 11 }}
        />
        <SmallButton title={saving ? 'Saving…' : 'Save'} variant="primary" onPress={save} disabled={!trimmed || saving || trimmed === profile?.display_name} />
      </View>
      {error ? <T variant="monoSm" color={Colors.hard}>{error}</T> : null}
    </View>
  );
}

export default function Settings() {
  const { profile, link, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const lc = profile?.leetcode_username;

  const linkFailed = () => setLinkError('couldn’t open that link.');

  const removeAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
    } catch (e) {
      setDeleteError(e instanceof Error && e.message ? e.message : 'Couldn’t delete your account. Try again.');
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <NavHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <SectionLabel>Account</SectionLabel>
        <Group>
          <GroupRow
            icon={icon(User)}
            label="Edit profile"
            detail={<T variant="monoSm">{editing ? 'close' : profile?.display_name}</T>}
            onPress={() => setEditing((v) => !v)}
          />
          {editing ? <NameEditor onDone={() => setEditing(false)} /> : null}
          <GroupRow
            icon={icon(Code)}
            label="LeetCode account"
            detail={lc
              ? <T style={{ fontFamily: Fonts.mono, fontSize: 12 }} color={Colors.accent}>@{lc} ✓</T>
              : link ? <T style={{ fontFamily: Fonts.mono, fontSize: 12 }} color={Colors.medium}>@{link.leetcode_username} · verify</T> : undefined}
            onPress={lc ? () => open(`https://leetcode.com/u/${lc}/`, linkFailed) : link ? () => router.push('/verify') : undefined}
          />
          <GroupRow icon={icon(Ban)} label="Blocked users" detail={chevron} onPress={() => router.push('/blocked')} last />
        </Group>

        <SectionLabel>About</SectionLabel>
        <Group>
          <GroupRow icon={icon(FileText)} label="Terms of use" detail={chevron} onPress={() => open('https://leetup.app/terms', linkFailed)} />
          <GroupRow icon={icon(Shield)} label="Privacy policy" detail={chevron} onPress={() => open('https://leetup.app/privacy', linkFailed)} />
          <GroupRow
            icon={icon(Mail)}
            label="Contact support"
            detail={<T variant="monoSm">{SUPPORT_EMAIL}</T>}
            onPress={() => open(`mailto:${SUPPORT_EMAIL}`, () => setLinkError(`no mail app found. write to ${SUPPORT_EMAIL}`))}
            last
          />
        </Group>
        {linkError ? <T variant="monoSm" color={Colors.hard}>{linkError}</T> : null}

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button title="Sign out" variant="secondary" onPress={signOut} />
          {confirmDelete ? (
            <View style={styles.confirm}>
              <T style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 22 }} color={Colors.text}>Delete your account?</T>
              <T variant="bodySm">Your posts, comments, friends and streak are deleted for good. Your LeetCode account isn’t touched.</T>
              {deleteError ? <T variant="monoSm" color={Colors.hard}>{deleteError}</T> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Keep account" variant="secondary" style={{ flex: 1 }} disabled={deleting} onPress={() => { setConfirmDelete(false); setDeleteError(null); }} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete account permanently"
                  accessibilityState={{ disabled: deleting, busy: deleting }}
                  onPress={deleting ? undefined : removeAccount}
                  style={({ pressed }) => [styles.deleteBtn, { opacity: deleting ? 0.5 : pressed ? 0.85 : 1 }]}
                >
                  {deleting ? <ActivityIndicator color={Colors.text} /> : null}
                  <T variant="button" color={Colors.text}>Delete</T>
                </Pressable>
              </View>
            </View>
          ) : (
            <Button title="Delete account" variant="danger" onPress={() => setConfirmDelete(true)} />
          )}
        </View>

        <View style={{ alignItems: 'center', gap: 4, marginTop: 16 }}>
          <T style={styles.footer}>leetup v{Constants.expoConfig?.version}</T>
          <T style={styles.footer}>not affiliated with or endorsed by LeetCode</T>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 8, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  confirm: { gap: 10, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.hardTint, borderWidth: 1, borderColor: Colors.hardLine },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 16, borderRadius: Radius.md, backgroundColor: Colors.hard },
  footer: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16, color: Colors.text3, textAlign: 'center' },
});
