import '@/global.css';

import { Platform } from 'react-native';

/**
 * Direction claire minimaliste — design handoff v3 (logo cadrans empilés).
 * Palette : fond quasi blanc teinté périwinkle, encre #16182B, accent #4C6FFF.
 */
export const Brand = {
  // Fond écran (dégradé linéaire 178°)
  bgTop: '#F7F8FC',
  bgBottom: '#EEF1FB',
  // Fond « chambre » (capture, radial)
  chamberInner: '#F1F3FB',
  chamberOuter: '#DEE3F5',
  ink: '#16182B',
  inkSecondary: 'rgba(22,24,43,0.55)',
  inkTertiary: 'rgba(22,24,43,0.40)',
  accent: '#4C6FFF',
  accentDark: '#3B57E0',
  accentLight: '#6E7CFF',
  positive: '#1F9D63',
  negative: '#E0653C',
  // Cadrans du logo (avant / milieu / arrière)
  logoFront: '#4C6FFF',
  logoMid: '#6E7CFF',
  logoBack: '#B9C4FF',
  // Cadran placeholder
  dialLight: '#FCFCFF',
  dialDark: '#C7D0F0',
  dialBorder: 'rgba(110,124,255,0.35)',
} as const;

export const Colors = {
  light: {
    text: Brand.ink,
    background: Brand.bgTop,
    backgroundElement: 'rgba(255,255,255,0.72)',
    backgroundSelected: 'rgba(76,111,255,0.10)',
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
    backgroundElement: 'rgba(255,255,255,0.72)',
    backgroundSelected: 'rgba(76,111,255,0.10)',
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
