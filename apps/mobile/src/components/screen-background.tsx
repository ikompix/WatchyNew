import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Brand } from '@/constants/theme';

type ScreenBackgroundProps = {
  /** Variante radiale « chambre » pour l'écran de capture */
  chamber?: boolean;
};

/**
 * Fond clair du handoff : dégradé #eef1f5 → #e4e9f0 + glows accent très
 * diffus pour que le verre ait de la matière à capter.
 */
export function ScreenBackground({ chamber }: ScreenBackgroundProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {chamber ? (
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="chamber" cx="50%" cy="42%" r="75%">
              <Stop offset="0%" stopColor={Brand.chamberInner} />
              <Stop offset="100%" stopColor={Brand.chamberOuter} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="120%" fill="url(#chamber)" />
        </Svg>
      ) : (
        <LinearGradient
          colors={[Brand.bgTop, Brand.bgBottom]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.52, y: 1 }}
        />
      )}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="halo-accent" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={Brand.accent} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={Brand.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="18%" cy="12%" r="55%" fill="url(#halo-accent)" />
        <Circle cx="92%" cy="88%" r="60%" fill="url(#halo-accent)" />
      </Svg>
    </View>
  );
}
