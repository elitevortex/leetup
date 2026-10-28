import React, { forwardRef, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { initials } from '../../lib/format';
import { Difficulty } from '../../types';
import { T } from './T';

export { T } from './T';

// ---------- Layout ----------

export function Screen({ children, edges = ['top'], style }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: Colors.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityRole="header" accessibilityLabel="LeetUp">
      <T style={{ fontFamily: Fonts.monoSemiBold, fontSize: size, lineHeight: size * 1.25, letterSpacing: -size * 0.04, color: Colors.text }}>leetup</T>
      <View style={{ width: size * 0.5, height: size * 0.92, marginLeft: 2, backgroundColor: Colors.accent }} />
    </View>
  );
}

// Back button + centred title, for pushed screens
export function NavHeader({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.navHeader}>
      <IconButton label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
        <ChevronLeft size={20} color={Colors.text} />
      </IconButton>
      <T variant="name" style={{ flex: 1, textAlign: 'center', fontSize: 17 }} numberOfLines={1}>
        {title}
      </T>
      <View style={{ minWidth: 38, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

// Big left-aligned title, for tab screens
export function TabHeader({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.tabHeader}>
      <View style={{ flex: 1 }}>{typeof title === 'string' ? <T variant="title" style={{ fontSize: 28, lineHeight: 34 }}>{title}</T> : title}</View>
      {right}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <T variant="comment" style={{ flex: 1 }}>{`// ${children}`}</T>
      {right}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: Colors.border }} />;
}

// Soft accent glow behind hero content
export function Glow({ size = 340, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, alignSelf: 'center' }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.accent} stopOpacity={0.22} />
            <Stop offset="0.55" stopColor={Colors.accent} stopOpacity={0.07} />
            <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

// ---------- Controls ----------

export function IconButton({ label, children, onPress, style, size = 38 }: { label: string; children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'light';

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: Colors.accent, fg: Colors.accentInk, border: Colors.accent },
  secondary: { bg: Colors.surface2, fg: Colors.text, border: Colors.borderStrong },
  danger: { bg: Colors.hardTint, fg: Colors.hard, border: Colors.hard },
  light: { bg: Colors.text, fg: Colors.bg, border: Colors.text },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  pill,
  style,
  textColor,
}: {
  title: string;
  textColor?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: (color: string) => ReactNode;
  loading?: boolean;
  disabled?: boolean;
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = BUTTON_COLORS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 15,
          paddingHorizontal: pill ? 24 : 16,
          borderRadius: pill ? Radius.full : Radius.md,
          borderWidth: 1,
          backgroundColor: c.bg,
          borderColor: c.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: pill ? 'center' : 'stretch',
        },
        pill && variant === 'primary' ? styles.glow : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor ?? c.fg} /> : icon?.(textColor ?? c.fg)}
      <T variant="button" color={textColor ?? c.fg}>{title}</T>
    </Pressable>
  );
}

export function SmallButton({ title, onPress, variant = 'secondary', disabled, accessibilityLabel }: { title: string; onPress?: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean; accessibilityLabel?: string }) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 9,
        backgroundColor: primary ? Colors.accent : Colors.surface2,
        borderWidth: 1,
        borderColor: primary ? Colors.accent : Colors.borderStrong,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <T style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13 }} color={primary ? Colors.accentInk : Colors.text}>{title}</T>
    </Pressable>
  );
}

// Text field with the brand's green > prompt
export const Input = forwardRef<TextInput, TextInputProps & { prompt?: boolean; containerStyle?: StyleProp<ViewStyle>; right?: ReactNode }>(
  function Input({ prompt = true, containerStyle, right, onFocus, onBlur, style, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <View style={[styles.input, focused && { borderColor: Colors.accent }, containerStyle]}>
        {prompt ? <T style={{ fontFamily: Fonts.monoMedium, fontSize: 15 }} color={Colors.accent}>{'>'}</T> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={Colors.text3}
          selectionColor={Colors.accent}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[{ flex: 1, fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, paddingVertical: 0, minHeight: 20 }, WEB_NO_OUTLINE, style]}
          {...rest}
        />
        {right}
      </View>
    );
  },
);

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: Colors.surface2, borderColor: Colors.borderStrong }]}
          >
            <T style={{ fontFamily: on ? Fonts.monoMedium : Fonts.mono, fontSize: 13 }} color={on ? Colors.text : Colors.text3}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Data display ----------

export function Avatar({ name, url, size = 36, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Colors.surface2,
        borderWidth: ring ? 2 : 1,
        borderColor: ring ?? Colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      ) : (
        <T style={{ fontFamily: Fonts.monoMedium, fontSize: Math.round(size * 0.34) }} color={Colors.text2}>{initials(name)}</T>
      )}
    </View>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { id: string; name: string; url?: string | null }[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row' }}>
        {shown.map((p, i) => (
          <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 18, borderWidth: 2, borderColor: Colors.bg }}>
            <Avatar name={p.name} url={p.url} size={30} />
          </View>
        ))}
      </View>
      {extra > 0 ? (
        <View style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.surface2 }}>
          <T variant="monoSm" color={Colors.text2}>+{extra}</T>
        </View>
      ) : null}
    </View>
  );
}

const PILL: Record<Difficulty, { fg: string; bg: string; line: string }> = {
  Easy: { fg: Colors.easy, bg: Colors.easyTint, line: Colors.easyLine },
  Medium: { fg: Colors.medium, bg: Colors.mediumTint, line: Colors.mediumLine },
  Hard: { fg: Colors.hard, bg: Colors.hardTint, line: Colors.hardLine },
};

export function DifficultyPill({ difficulty }: { difficulty: Difficulty }) {
  const c = PILL[difficulty];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, backgroundColor: c.bg, borderColor: c.line }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} />
      <T style={{ fontFamily: Fonts.monoMedium, fontSize: 11, letterSpacing: 0.6 }} color={c.fg}>{difficulty.toUpperCase()}</T>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: PressableProps['onPress'] }) {
  const base = { padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24 }}>
      {icon}
      <T variant="h2" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T variant="bodySm" style={{ textAlign: 'center' }}>{body}</T> : null}
      {action}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

// Row inside a settings-style group
export function GroupRow({ icon, label, detail, onPress, danger, last, accessibilityLabel }: { icon?: ReactNode; label: string; detail?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 15,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Colors.border,
        backgroundColor: pressed ? Colors.surface2 : 'transparent',
      })}
    >
      {icon}
      <T variant="medium" color={danger ? Colors.hard : Colors.text} style={{ flex: 1 }}>{label}</T>
      {detail}
    </Pressable>
  );
}

export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }, style]}>{children}</View>;
}

// The container's border already shows focus; drop the browser's own outline on web
const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

const styles = StyleSheet.create({
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  tabHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  glow: { shadowColor: Colors.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
