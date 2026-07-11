import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import type { AgeRange, Expertise } from '@watchy/types';

import { apiPatch, apiPost } from '@/lib/api-client';
import { Brand, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';

const SOURCE_KEYS = [
  'tiktok',
  'instagram',
  'app_store',
  'bouche_a_oreille',
  'ami_collectionneur',
  'presse',
  'autre',
] as const;

const EXPERTISE_KEYS: Expertise[] = ['novice', 'passionne', 'collectionneur', 'metier'];

const AGES: AgeRange[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

/**
 * Deux questions éclair, toutes deux passables : source d'acquisition puis
 * profil horloger (expertise + tranche d'âge). Fire-and-forget — un échec
 * réseau ne bloque jamais l'onboarding.
 */
export default function Source() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'source' | 'profile'>('source');
  const [source, setSource] = useState<string | null>(null);
  const [expertise, setExpertise] = useState<Expertise | null>(null);
  const [age, setAge] = useState<AgeRange | null>(null);

  function chooseSource(key: string) {
    if (source) return;
    setSource(key);
    apiPost('/me/acquisition-source', { source: key }).catch(() => {});
    setTimeout(() => setStep('profile'), 250);
  }

  function next() {
    if (expertise || age) {
      apiPatch('/me/profile', {
        ...(expertise ? { expertise } : {}),
        ...(age ? { ageRange: age } : {}),
      }).catch(() => {});
    }
    router.push('/(onboarding)/camera');
  }

  const isSource = step === 'source';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.three },
      ]}
    >
      <ScreenBackground />
      <View style={styles.body}>
        <LinearGradient
          colors={[Brand.accentLight, Brand.accentDark]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.iconTile}
        >
          <SymbolView
            name={isSource ? 'hand.wave.fill' : 'person.crop.circle.badge.checkmark'}
            size={26}
            tintColor="#ffffff"
          />
        </LinearGradient>

        {isSource ? (
          <>
            <ThemedText type="title" style={styles.title}>
              {t('onboarding.sourceTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t('onboarding.sourceSubtitle')}
            </ThemedText>
            <View style={styles.chips}>
              {SOURCE_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={t(`onboarding.sources.${key}`)}
                  on={source === key}
                  onPress={() => chooseSource(key)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <ThemedText type="title" style={styles.title}>
              {t('onboarding.profileTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {t('onboarding.profileSubtitle')}
            </ThemedText>
            <View style={styles.chips}>
              {EXPERTISE_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={t(`labels.expertise.${key}`)}
                  on={expertise === key}
                  onPress={() => setExpertise(expertise === key ? null : key)}
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.ageLabel}>
              {t('onboarding.ageLabel')}
            </ThemedText>
            <View style={styles.chips}>
              {AGES.map((a) => (
                <Chip key={a} label={a} on={age === a} onPress={() => setAge(age === a ? null : a)} />
              ))}
            </View>
          </>
        )}
      </View>

      {isSource ? (
        <Pressable onPress={() => setStep('profile')} hitSlop={8} style={styles.skip}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('onboarding.skip')}
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable onPress={next} hitSlop={8} style={styles.skip}>
          <ThemedText type="smallBold" themeColor="interactive">
            {expertise || age ? t('common.continue') : t('onboarding.skip')}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <ThemedText
        type="smallBold"
        themeColor={on ? undefined : 'textSecondary'}
        style={on ? styles.chipTextOn : undefined}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
    justifyContent: 'space-between',
  },
  body: {
    alignItems: 'center',
    marginTop: Spacing.five,
    gap: Spacing.three,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 26,
    lineHeight: 31,
  },
  subtitle: {
    textAlign: 'center',
  },
  ageLabel: {
    marginTop: Spacing.two,
  },
  chips: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.field,
    borderWidth: 1,
    borderColor: 'rgba(22,24,43,0.14)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipOn: {
    borderColor: Brand.accent,
    backgroundColor: Brand.accent,
  },
  chipTextOn: {
    color: '#ffffff',
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
