import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { enablePushNotifications } from '@/lib/push';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

export default function NotificationsPrimer() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function next() {
    router.push('/(onboarding)/premium');
  }

  async function enable() {
    // Primer avant le prompt système — opt-in explicite, jeton enregistré
    // seulement si accordé (envois manuels depuis le back office uniquement)
    await enablePushNotifications();
    next();
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
          <SymbolView name="bell.badge.fill" size={26} tintColor="#ffffff" />
        </LinearGradient>

        <ThemedText type="title" style={styles.title}>
          {t('onboardingNotifications.title')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {t('onboardingNotifications.subtitle')}
        </ThemedText>

        {/* Exemple d'annonce */}
        <View style={styles.stretch}>
          <GlassCard glow style={styles.exampleCard}>
            <View style={styles.exampleIcon}>
              <SymbolView name="app.badge" size={18} tintColor={Brand.accent} />
            </View>
            <View style={styles.exampleText}>
              <ThemedText type="smallBold">{t('onboardingNotifications.exampleTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('onboardingNotifications.exampleBody')}
              </ThemedText>
            </View>
          </GlassCard>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label={t('onboardingNotifications.enable')} onPress={enable} />
        <Pressable onPress={next} style={styles.skipLink} hitSlop={8}>
          <ThemedText type="link" themeColor="textSecondary">
            {t('onboardingNotifications.later')}
          </ThemedText>
        </Pressable>
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
  subtitle: {
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: Spacing.two,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  exampleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(76,111,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleText: {
    flex: 1,
    gap: 2,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  skipLink: {
    paddingVertical: Spacing.two,
  },
});
