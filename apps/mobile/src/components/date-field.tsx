import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Colors, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';

type DateFieldProps = {
  label: string;
  /** 'AAAA-MM-JJ' ou chaîne vide */
  value: string;
  onChange: (value: string) => void;
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Champ date optionnel avec le sélecteur natif de l'OS.
 * Vide → « Ajouter » ; rempli → picker compact iOS (ou dialogue Android) + effacement.
 */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const date = value ? parseIsoDate(value) : null;

  function openAndroidPicker() {
    DateTimePickerAndroid.open({
      value: date ?? new Date(),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) onChange(toIsoDate(selected));
      },
    });
  }

  function startPicking() {
    if (Platform.OS === 'android') {
      openAndroidPicker();
    } else {
      // iOS : donner une valeur fait apparaître le picker compact natif
      onChange(toIsoDate(new Date()));
    }
  }

  return (
    <View style={styles.row}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>

      {date == null ? (
        <Pressable onPress={startPicking} hitSlop={8}>
          <ThemedText type="small" themeColor="interactive">
            Ajouter
          </ThemedText>
        </Pressable>
      ) : (
        <View style={styles.pickerGroup}>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="compact"
              themeVariant="light"
              accentColor={Colors.light.accent}
              maximumDate={new Date()}
              onChange={(_, selected) => {
                if (selected) onChange(toIsoDate(selected));
              }}
            />
          ) : (
            <Pressable onPress={openAndroidPicker} hitSlop={8}>
              <ThemedText type="default">{value}</ThemedText>
            </Pressable>
          )}
          <Pressable onPress={() => onChange('')} hitSlop={10} style={styles.clear}>
            <SymbolView
              name="xmark.circle.fill"
              size={16}
              tintColor={Colors.light.textSecondary}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    flexShrink: 1,
    color: Colors.light.textSecondary,
  },
  pickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  clear: {
    padding: 2,
  },
});
