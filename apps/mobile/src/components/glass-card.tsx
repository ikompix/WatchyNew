import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Brand, Radii } from '@/constants/theme';

type GlassCardProps = ViewProps & {
  children?: React.ReactNode;
  /**
   * Halo accent diffus derrière le verre (README §Matériau) — à activer sur
   * les cartes importantes (valeur totale, sheet de résultat), pas partout.
   */
  glow?: boolean;
};

let LiquidGlassView: React.ComponentType<any> | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glass = require('expo-glass-effect');
    // GlassView degrades to a bare View before iOS 26 — gate on availability
    if (glass.isLiquidGlassAvailable?.()) {
      LiquidGlassView = glass.GlassView;
    }
  } catch {
    // module absent — manual glass below
  }
}

function Glow() {
  return (
    <View style={styles.glow} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="card-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={Brand.accent} stopOpacity={0.22} />
            <Stop offset="72%" stopColor={Brand.accent} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={Brand.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Ellipse : rx/ry se calculent sur largeur/hauteur séparément — un
            cercle en % se calcule sur la diagonale et déborde de la boîte,
            d'où un halo rogné en ligne droite */}
        <Ellipse cx="50%" cy="48%" rx="48%" ry="46%" fill="url(#card-glow)" />
      </Svg>
    </View>
  );
}

function ManualGlass({ style, children, glow, ...props }: GlassCardProps) {
  return (
    <View style={styles.wrap}>
      {glow ? <Glow /> : null}
      <View style={[styles.card, style]} {...props}>
        <View style={styles.topHighlight} pointerEvents="none" />
        {children}
      </View>
    </View>
  );
}

export function GlassCard({ style, children, glow, ...props }: GlassCardProps) {
  if (LiquidGlassView) {
    return (
      <View style={styles.wrap}>
        {glow ? <Glow /> : null}
        <LiquidGlassView
          glassEffectStyle="regular"
          colorScheme="light"
          tintColor="rgba(255,255,255,0.55)"
          style={[styles.card, style]}
          {...props}
        >
          {children}
        </LiquidGlassView>
      </View>
    );
  }
  return (
    <ManualGlass style={style} glow={glow} {...props}>
      {children}
    </ManualGlass>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -36,
    left: -36,
    right: -36,
    bottom: -36,
  },
  // Verre clair du handoff : blanc .62, bordure blanche .8, reflet haut,
  // ombre douce bleutée
  card: {
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.62)',
    overflow: 'hidden',
    padding: 16,
    shadowColor: 'rgb(40,55,80)',
    shadowOpacity: 0.12,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
});
