import { Pressable, StyleSheet, View } from 'react-native';
import { Brand, Fonts, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';

type SegmentedTextProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
  /** Options sans données : très pâles, non tappables */
  disabledOptions?: readonly T[];
};

/** Segmented « texte souligné » du handoff (Par valeur / Récent, 1M/6M/1A/MAX). */
export function SegmentedText<T extends string>({
  options,
  value,
  onChange,
  labels,
  disabledOptions,
}: SegmentedTextProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option === value;
        const disabled = disabledOptions?.includes(option) ?? false;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            hitSlop={8}
            disabled={disabled}
          >
            <View style={[styles.item, active && styles.itemActive]}>
              <ThemedText
                type="link"
                style={[
                  styles.label,
                  disabled
                    ? styles.labelDisabled
                    : active
                      ? styles.labelActive
                      : styles.labelInactive,
                ]}
              >
                {labels?.[option] ?? option}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  item: {
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  itemActive: {
    borderBottomColor: Brand.accentDark,
  },
  label: {
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 13,
  },
  labelActive: {
    color: Brand.ink,
  },
  labelInactive: {
    color: Brand.inkTertiary,
  },
  labelDisabled: {
    color: 'rgba(27,37,49,0.18)',
  },
});
