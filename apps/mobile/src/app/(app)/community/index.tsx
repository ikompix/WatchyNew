import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { useFeatureInterest, useRegisterInterest } from '@/hooks/use-feature-interest';
import { Brand, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

const PITCH = [
  {
    icon: 'person.3' as const,
    title: 'Des communautés créées par les membres',
    text: 'Achat & revente, discussions par marque, conseils — les collectionneurs ont la main, pas nous.',
  },
  {
    icon: 'text.bubble' as const,
    title: 'Des fils de discussion',
    text: 'Postez, commentez, échangez autour de vos montres, comme sur vos forums préférés.',
  },
  {
    icon: 'lock' as const,
    title: 'Profil public ou privé — vous décidez',
    text: 'Montrez votre vitrine de collection… ou restez discret. Privé par défaut.',
  },
];

/** Teaser de la communauté (V2) — mesure l'intérêt des bêta-testeurs. */
export default function CommunityTeaser() {
  const insets = useSafeAreaInsets();
  const { data } = useFeatureInterest();
  const register = useRegisterInterest();
  const notified = data?.features.includes('community') ?? false;

  function notifyMe() {
    register.mutate('community', {
      onError: (err) => Alert.alert('Réessayez', err.message),
    });
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <View style={{ paddingTop: insets.top + 56, flex: 1 }}>
        <View style={styles.header}>
          <ThemedText type="title">Communauté</ThemedText>
          <View style={styles.badge}>
            <ThemedText type="delta" style={styles.badgeText}>
              Bientôt
            </ThemedText>
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Le prochain chapitre de Watchy : échanger entre collectionneurs.
        </ThemedText>

        <View style={styles.cards}>
          {PITCH.map((item) => (
            <GlassCard key={item.title} style={styles.card}>
              <View style={styles.cardIcon}>
                <SymbolView name={item.icon} size={17} tintColor={Brand.accent} />
              </View>
              <View style={styles.cardText}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
                  {item.text}
                </ThemedText>
              </View>
            </GlassCard>
          ))}

          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.premiumStrip}
          >
            <SymbolView name="crown.fill" size={14} tintColor="#ffffff" />
            <ThemedText type="small" style={styles.premiumText}>
              Les membres Premium pourront créer leurs propres communautés.
            </ThemedText>
          </LinearGradient>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.three }]}>
          {notified ? (
            <View style={styles.notifiedRow}>
              <SymbolView name="checkmark.circle.fill" size={18} tintColor={Brand.positive} />
              <ThemedText type="smallBold">On vous préviendra dès l'ouverture.</ThemedText>
            </View>
          ) : (
            <PrimaryButton label="Me prévenir" onPress={notifyMe} loading={register.isPending} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    backgroundColor: 'rgba(91,127,166,0.14)',
    borderRadius: Radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    color: Brand.accentDark,
  },
  subtitle: {
    marginTop: Spacing.one,
  },
  cards: {
    marginTop: Spacing.four,
    gap: Spacing.two,
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(91,127,166,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardBody: {
    lineHeight: 18,
  },
  premiumStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radii.field,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  premiumText: {
    color: '#ffffff',
    flex: 1,
  },
  actions: {
    paddingTop: Spacing.two,
  },
  notifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
  },
});
