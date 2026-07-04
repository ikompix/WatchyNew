import '@/global.css';

import { Platform } from 'react-native';

/**
 * Direction claire « 1b » — design handoff P0.
 * Palette : fond gris-bleu pâle, texte encre, accent bleu acier.
 */
export const Brand = {
  // Fond écran (dégradé linéaire 178°)
  bgTop: '#eef1f5',
  bgBottom: '#e4e9f0',
  // Fond « chambre » (capture, radial)
  chamberInner: '#e9edf2',
  chamberOuter: '#d3d9e1',
  ink: '#1b2531',
  inkSecondary: 'rgba(27,37,49,0.55)',
  inkTertiary: 'rgba(27,37,49,0.40)',
  accent: '#5b7fa6',
  accentDark: '#4a6f97',
  accentLight: '#6b8fb6',
  positive: '#2e7a4f',
  negative: '#b0692e',
  // Cadran placeholder
  dialLight: '#fbfcfd',
  dialDark: '#c4ccd6',
  dialBorder: 'rgba(120,140,165,0.4)',
} as const;

export const Colors = {
  light: {
    text: Brand.ink,
    background: Brand.bgTop,
    backgroundElement: 'rgba(255,255,255,0.62)',
    backgroundSelected: 'rgba(91,127,166,0.12)',
    textSecondary: Brand.inkSecondary,
    accent: Brand.accent,
    interactive: Brand.accentDark,
    positive: Brand.positive,
    negative: Brand.negative,
  },
  // Direction sombre abandonnée — on sert la même palette pour éviter
  // tout écran mixte si le device est en dark mode.
  dark: {
    text: Brand.ink,
    background: Brand.bgTop,
    backgroundElement: 'rgba(255,255,255,0.62)',
    backgroundSelected: 'rgba(91,127,166,0.12)',
    textSecondary: Brand.inkSecondary,
    accent: Brand.accent,
    interactive: Brand.accentDark,
    positive: Brand.positive,
    negative: Brand.negative,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Toute l'UI est en Space Grotesk ; les références produit restent en mono.
export const Fonts = Platform.select({
  web: {
    regular: 'var(--font-body)',
    medium: 'var(--font-body)',
    semibold: 'var(--font-display)',
    bold: 'var(--font-display)',
    mono: 'var(--font-mono)',
  },
  default: {
    regular: 'SpaceGrotesk_400Regular',
    medium: 'SpaceGrotesk_500Medium',
    semibold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
    mono: 'IBMPlexMono_400Regular',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Rayons du handoff : champs/mini-cartes 15, cartes 18, pilules 20, sheet 26. */
export const Radii = {
  field: 15,
  card: 18,
  pill: 20,
  button: 16,
  sheet: 26,
} as const;

/** Horizontal screen margin — same on every screen. */
export const Gutter = 20;
/** Gap between cards in grids and stacks. */
export const CardGap = 12;

export const MaxContentWidth = 800;
