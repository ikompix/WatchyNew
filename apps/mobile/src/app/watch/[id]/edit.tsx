import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WATCH_CONDITIONS } from '@watchy/types';
import type { UpdateWatchDto, Watch, WatchCondition } from '@watchy/types';

import { useWatch, useUpdateWatch } from '@/hooks/use-watches';
import { apiErrorMessage } from '@/lib/premium-gate';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';
import { DateField } from '@/components/date-field';

type Draft = {
  brand: string;
  model: string;
  reference: string;
  nickname: string;
  purchaseDate: string;
  purchasePrice: string;
  dialColor: string;
  productionYear: string;
  condition: WatchCondition | null;
  hasPapers: boolean;
  hasBox: boolean;
  notes: string;
};

function draftFromWatch(w: Watch): Draft {
  return {
    brand: w.brand,
    model: w.model,
    reference: w.reference ?? '',
    nickname: w.nickname ?? '',
    purchaseDate: w.purchaseDate ?? '',
    purchasePrice: w.purchasePrice != null ? String(w.purchasePrice) : '',
    dialColor: w.dialColor ?? '',
    productionYear: w.productionYear != null ? String(w.productionYear) : '',
    condition: (w.condition as WatchCondition | null) ?? null,
    hasPapers: w.hasPapers,
    hasBox: w.hasBox,
    notes: w.notes ?? '',
  };
}

/**
 * Édition de la fiche — tout se modifie ici puis s'enregistre en une seule
 * requête ; la fiche montre elle-même est en lecture seule.
 */
export default function WatchEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: watch } = useWatch(id);

  if (!watch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ScreenBackground />
        <ActivityIndicator color={Brand.accent} />
      </View>
    );
  }

  // Le formulaire n'est monté qu'une fois la montre chargée : son état
  // s'initialise au montage, sans effet de synchronisation.
  return <WatchEditForm watch={watch} />;
}

function WatchEditForm({ watch }: { watch: Watch }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const updateWatch = useUpdateWatch();

  const [draft, setDraft] = useState<Draft>(() => draftFromWatch(watch));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    const d = draft;
    const brand = d.brand.trim();
    const model = d.model.trim();
    if (!brand || !model) {
      Alert.alert(t('watchEdit.requiredTitle'), t('watchEdit.requiredMessage'));
      return;
    }

    let purchasePrice: number | null = null;
    if (d.purchasePrice.trim()) {
      const n = Number(d.purchasePrice.replace(',', '.'));
      if (!(n > 0)) {
        Alert.alert(t('watchEdit.invalidPriceTitle'), t('watchEdit.invalidPriceMessage'));
        return;
      }
      purchasePrice = n;
    }

    let productionYear: number | null = null;
    if (d.productionYear.trim()) {
      const n = Number(d.productionYear);
      if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear()) {
        Alert.alert(
          t('watchEdit.invalidYearTitle'),
          t('watchEdit.invalidYearMessage', { maxYear: new Date().getFullYear() })
        );
        return;
      }
      productionYear = n;
    }

    const dto: UpdateWatchDto = {
      brand,
      model,
      reference: d.reference.trim() || null,
      nickname: d.nickname.trim() || null,
      purchaseDate: d.purchaseDate || null,
      purchasePrice,
      dialColor: d.dialColor.trim() || null,
      productionYear,
      condition: d.condition,
      hasPapers: d.hasPapers,
      hasBox: d.hasBox,
      notes: d.notes.trim() || null,
    };

    updateWatch.mutate(
      { id: watch.id, dto },
      {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert(t('watchEdit.saveErrorTitle'), apiErrorMessage(err)),
      }
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + Spacing.five },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="title">{t('watchEdit.title')}</ThemedText>

        {/* Identité */}
        <GlassCard style={styles.identityCard}>
          <TextInput
            style={styles.identityInput}
            placeholder={t('watchEdit.brandPlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={draft.brand}
            onChangeText={(v) => set('brand', v)}
          />
          <View style={styles.divider} />
          <TextInput
            style={styles.identityInput}
            placeholder={t('watchEdit.modelPlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={draft.model}
            onChangeText={(v) => set('model', v)}
          />
          <View style={styles.divider} />
          <TextInput
            style={styles.identityInput}
            placeholder={t('modelSearch.referencePlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={draft.reference}
            onChangeText={(v) => set('reference', v)}
            autoCapitalize="characters"
          />
          <View style={styles.divider} />
          <TextInput
            style={styles.identityInput}
            placeholder={t('watchEdit.nicknamePlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={draft.nickname}
            onChangeText={(v) => set('nickname', v)}
          />
        </GlassCard>

        {/* Détails */}
        <GlassCard style={styles.fieldsCard}>
          <DateField
            label={t('watchDetail.purchaseDate')}
            value={draft.purchaseDate}
            onChange={(v) => set('purchaseDate', v)}
          />
          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.purchasePrice')}
            </ThemedText>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.numberInput}
                placeholder="0"
                placeholderTextColor={Brand.inkTertiary}
                value={draft.purchasePrice}
                onChangeText={(v) => set('purchasePrice', v)}
                keyboardType="decimal-pad"
              />
              <ThemedText type="default" themeColor="textSecondary">
                €
              </ThemedText>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.papers')}
            </ThemedText>
            <Switch
              value={draft.hasPapers}
              onValueChange={(v) => set('hasPapers', v)}
              trackColor={{ false: 'rgba(27,37,49,0.12)', true: Brand.accent }}
              thumbColor="#ffffff"
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.box')}
            </ThemedText>
            <Switch
              value={draft.hasBox}
              onValueChange={(v) => set('hasBox', v)}
              trackColor={{ false: 'rgba(27,37,49,0.12)', true: Brand.accent }}
              thumbColor="#ffffff"
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.dialColor')}
            </ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder={t('watchEdit.dialColorPlaceholder')}
              placeholderTextColor={Brand.inkTertiary}
              value={draft.dialColor}
              onChangeText={(v) => set('dialColor', v)}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.year')}
            </ThemedText>
            <TextInput
              style={styles.numberInput}
              placeholder="2021"
              placeholderTextColor={Brand.inkTertiary}
              value={draft.productionYear}
              onChangeText={(v) => set('productionYear', v)}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.fieldRowTall}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.condition')}
            </ThemedText>
            <View style={styles.chipsRow}>
              {WATCH_CONDITIONS.map((cond) => {
                const active = draft.condition === cond;
                return (
                  <Pressable
                    key={cond}
                    onPress={() => set('condition', active ? null : (cond as WatchCondition))}
                    style={[styles.chip, active && styles.chipActive]}
                    hitSlop={4}
                  >
                    <ThemedText
                      type="small"
                      style={active ? styles.chipTextActive : styles.chipText}
                    >
                      {t(`labels.conditions.${cond}`)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.notesBlock}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('watchDetail.notes')}
            </ThemedText>
            <TextInput
              style={styles.notesInput}
              placeholder={t('watchEdit.notesPlaceholder')}
              placeholderTextColor={Brand.inkTertiary}
              value={draft.notes}
              onChangeText={(v) => set('notes', v)}
              multiline
            />
          </View>
        </GlassCard>

        <PrimaryButton
          label={updateWatch.isPending ? t('watchEdit.saving') : t('common.save')}
          onPress={save}
          disabled={updateWatch.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Gutter,
    gap: Spacing.three,
  },
  identityCard: {
    padding: 0,
    borderRadius: Radii.field,
  },
  identityInput: {
    height: 48,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Brand.ink,
  },
  fieldsCard: {
    padding: 0,
    borderRadius: Radii.card,
  },
  fieldRow: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fieldRowTall: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.06)',
    marginHorizontal: Spacing.three,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  numberInput: {
    minWidth: 80,
    textAlign: 'right',
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: Brand.ink,
    paddingVertical: Spacing.two,
  },
  textInput: {
    flex: 1,
    textAlign: 'right',
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Brand.ink,
    paddingVertical: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(27,37,49,0.14)',
  },
  chipActive: {
    borderColor: Brand.accent,
    backgroundColor: 'rgba(91,127,166,0.12)',
  },
  chipText: {
    color: Brand.inkSecondary,
  },
  chipTextActive: {
    color: Brand.accentDark,
  },
  notesBlock: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    gap: 4,
  },
  notesInput: {
    minHeight: 72,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Brand.ink,
    textAlignVertical: 'top',
  },
});
