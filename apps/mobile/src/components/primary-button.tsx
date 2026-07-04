import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand, Radii } from '@/constants/theme';
import { ThemedText } from './themed-text';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Bouton principal du handoff : dégradé accent, blanc, ombre bleue. */
export function PrimaryButton({ label, onPress, loading, disabled, style }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrap, (disabled || loading) && styles.disabled, style]}
    >
      <LinearGradient
        colors={[Brand.accentLight, Brand.accentDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText type="link" style={styles.label}>
            {label}
          </ThemedText>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: Radii.button,
    shadowColor: Brand.accentDark,
    shadowOpacity: 0.35,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
  button: {
    height: 52,
    borderRadius: Radii.button,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
  },
});
