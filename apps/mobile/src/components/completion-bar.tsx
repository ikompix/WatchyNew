import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';

type CompletionBarProps = {
  /** 0–100 */
  value: number;
};

/** Barre de complétion linéaire du handoff (fiche montre). */
export function CompletionBar({ value }: CompletionBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <ThemedText type="small" themeColor="textSecondary">
          Fiche complétée
        </ThemedText>
        <ThemedText type="smallBold" style={styles.pct}>
          {Math.round(pct)}%
        </ThemedText>
      </View>
      <View style={styles.track}>
        <LinearGradient
          colors={[Brand.accentLight, Brand.accentDark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, { width: `${pct}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  pct: {
    color: Brand.accent,
  },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(27,37,49,0.09)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
