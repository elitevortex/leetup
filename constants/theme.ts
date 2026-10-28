// LeetUp design tokens. Source of truth: the LeetUp design system (tokens.json).

export const Colors = {
  bg: '#09090b',
  surface: '#111113',
  surface2: '#18181b',
  border: '#27272a',
  borderStrong: '#3f3f46',
  text: '#fafafa',
  text2: '#a1a1aa',
  text3: '#85858f',
  accent: '#00d68f',
  accentInk: '#03140d',
  accentTint: 'rgba(0, 214, 143, 0.10)',
  accentLine: 'rgba(0, 214, 143, 0.35)',
  glow: 'rgba(0, 214, 143, 0.16)',
  easy: '#00d68f',
  easyTint: 'rgba(0, 214, 143, 0.12)',
  easyLine: 'rgba(0, 214, 143, 0.35)',
  medium: '#ffb224',
  mediumTint: 'rgba(255, 178, 36, 0.12)',
  mediumLine: 'rgba(255, 178, 36, 0.35)',
  hard: '#ff4d5e',
  hardTint: 'rgba(255, 77, 94, 0.10)',
  hardLine: 'rgba(255, 77, 94, 0.35)',
  like: '#ff6b81',
  syntaxBlue: '#7aa2f7',
  syntaxPurple: '#bb9af7',

  // Older names, kept until every screen moves to the tokens above
  background: '#09090b',
  surfaceLight: '#18181b',
  textSecondary: '#a1a1aa',
  textMuted: '#85858f',
  primary: '#00d68f',
  primaryDark: '#00b377',
  danger: '#ff4d5e',
  warning: '#ffb224',
} as const;

// Custom fonts need a family per weight in React Native; fontWeight alone won't switch faces.
export const Fonts = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemiBold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemiBold: 'GeistMono_600SemiBold',
  monoBold: 'GeistMono_700Bold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// Older name, kept until every screen moves to Radius
export const BorderRadius = Radius;
