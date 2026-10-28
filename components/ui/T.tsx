import { Text, TextProps, TextStyle } from 'react-native';
import { Colors, Fonts } from '../../constants/theme';

const VARIANTS = {
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: Colors.text },
  h2: { fontFamily: Fonts.sansSemiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: Colors.text },
  cardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 18, lineHeight: 24, color: Colors.text },
  name: { fontFamily: Fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: Colors.text },
  body: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, color: Colors.text2 },
  bodySm: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: Colors.text2 },
  medium: { fontFamily: Fonts.sansMedium, fontSize: 15, lineHeight: 20, color: Colors.text },
  button: { fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 20, color: Colors.text },
  tab: { fontFamily: Fonts.sansMedium, fontSize: 11, lineHeight: 14, color: Colors.text3 },
  // Code-comment section headers: // TODAY · 5 SOLVES
  comment: { fontFamily: Fonts.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, color: Colors.text3, textTransform: 'uppercase' },
  label: { fontFamily: Fonts.monoMedium, fontSize: 10, lineHeight: 13, letterSpacing: 0.7, color: Colors.text3, textTransform: 'uppercase' },
  mono: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 18, color: Colors.text2 },
  monoSm: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16, color: Colors.text3 },
  monoMedium: { fontFamily: Fonts.monoMedium, fontSize: 13, lineHeight: 18, color: Colors.text },
  stat: { fontFamily: Fonts.monoSemiBold, fontSize: 14, lineHeight: 18, color: Colors.text },
  bigStat: { fontFamily: Fonts.monoSemiBold, fontSize: 24, lineHeight: 28, letterSpacing: -1, color: Colors.text },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export function T({ variant = 'body', color, style, ...rest }: TextProps & { variant?: TextVariant; color?: string }) {
  return <Text {...rest} style={[VARIANTS[variant], color ? { color } : null, style]} />;
}
