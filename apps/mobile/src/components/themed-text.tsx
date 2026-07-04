import { StyleSheet, Text, type TextProps } from 'react-native';

import { Brand, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'hero'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'overline'
    | 'delta'
    | 'link'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'hero' && styles.hero,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'overline' && styles.overline,
        type === 'delta' && styles.delta,
        type === 'link' && styles.link,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

// Échelle du handoff (README §Typographie) — Space Grotesk partout,
// mono pour les références. Pas de fontWeight numérique avec police custom.
const styles = StyleSheet.create({
  default: {
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  // Grand titre écran (« Collection ») — 30/600, tracking -0.02em
  title: {
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  // Montants hero (valeur totale, cote) — tabular
  hero: {
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  // Titre de bloc / maison — 17/600
  subtitle: {
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 17,
    lineHeight: 22,
  },
  small: {
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  smallBold: {
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  overline: {
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // Delta % — 11/500, coloré par themeColor positive/negative
  delta: {
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  link: {
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  // Référence produit — mono accent, uppercase, tracking .03em
  code: {
    fontFamily: Fonts?.mono ?? 'IBMPlexMono_400Regular',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.36,
    textTransform: 'uppercase',
    color: Brand.accent,
  },
});
