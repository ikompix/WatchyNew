import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { getAnalyticsOptIn, setAnalyticsOptIn } from '@/lib/onboarding';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

const GUARANTEE_KEYS = ['photos', 'noResale', 'anonymous'] as const;

export default function Privacy() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Opt-in explicite : off par défaut (ATT / RGPD)
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    getAnalyticsOptIn().then(setOptIn);
  }, []);

  function toggle(value: boolean) {
    setOptIn(value);
    setAnalyticsOptIn(value);
  }

  function legalLink(doc: 'terms' | 'privacy') {
    router.push(`/legal/${doc}`);
  }

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
          <SymbolView name="lock.shield.fill" size={26} tintColor="#ffffff" />
        </LinearGradient>

        <ThemedText type="title" style={styles.title}>
          {t('onboarding.privacyTitle')}
        </ThemedText>

        <View style={styles.guarantees}>
          {GUARANTEE_KEYS.map((g) => (
            <View key={g} style={styles.guarantee}>
              <SymbolView name="checkmark" size={13} tintColor={Brand.positive} weight="semibold" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.guaranteeText}>
                {t(`onboarding.guarantees.${g}`)}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.stretch}>
        <GlassCard style={styles.optInCard}>
          <View style={styles.optInText}>
            <ThemedText type="smallBold" style={styles.optInTitle}>
              {t('onboarding.optInTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('onboarding.optInSubtitle')}
            </ThemedText>
          </View>
          <Switch
            value={optIn}
            onValueChange={toggle}
            trackColor={{ false: 'rgba(22,24,43,0.12)', true: Brand.accent }}
            thumbColor="#ffffff"
          />
        </GlassCard>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={t('onboarding.privacyCta')}
          onPress={() => router.push('/(onboarding)/notifications')}
        />
        <View style={styles.legalRow}>
          <Pressable onPress={() => legalLink('privacy')} hitSlop={8}>
            <ThemedText type="small" themeColor="interactive">
              {t('legal.privacyTitle')}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            ·{' '}
          </ThemedText>
          <Pressable onPress={() => legalLink('terms')} hitSlop={8}>
            <ThemedText type="small" themeColor="interactive">
              {t('legal.termsShort')}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stretch: {
    alignSelf: 'stretch',
  },
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
  guarantees: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  guarantee: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  guaranteeText: {
    flex: 1,
    lineHeight: 18,
  },
  optInCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  optInText: {
    flex: 1,
    gap: 1,
  },
  optInTitle: {
    fontSize: 14,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
});
