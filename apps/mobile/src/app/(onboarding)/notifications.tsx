import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { registerPushToken } from '@/lib/push';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';
import { WatchDial } from '@/components/watch-dial';

export default function NotificationsPrimer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function next() {
    router.push('/(onboarding)/privacy');
  }

  async function enable() {
    // Primer avant le prompt système — opt-in explicite
    await Notifications.requestPermissionsAsync();
    // Jeton enregistré pour les alertes de prix (no-op en Expo Go)
    registerPushToken();
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
          Restez informé des variations de cote
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Recevez une alerte quand la valeur d'un modèle bouge de façon significative. Rien
          d'autre — vous gardez le contrôle depuis les Réglages.
        </ThemedText>

        {/* Exemple d'alerte */}
        <View style={styles.stretch}>
        <GlassCard glow style={styles.exampleCard}>
          <WatchDial size={36} />
          <View style={styles.exampleText}>
            <ThemedText type="smallBold">Rolex Submariner Date</ThemedText>
            <View style={styles.exampleDelta}>
              <ThemedText type="delta" themeColor="positive">
                +6,2 %
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {' '}
                cette semaine
              </ThemedText>
            </View>
          </View>
        </GlassCard>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Activer les notifications" onPress={enable} />
        <Pressable onPress={next} style={styles.skipLink} hitSlop={8}>
          <ThemedText type="link" themeColor="textSecondary">
            Plus tard
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
  exampleText: {
    flex: 1,
    gap: 2,
  },
  exampleDelta: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  skipLink: {
    paddingVertical: Spacing.two,
  },
});
