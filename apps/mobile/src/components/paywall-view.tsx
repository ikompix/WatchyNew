import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';

import {
  getOfferingPrices,
  purchasePlan,
  restorePurchases,
  type OfferingPrices,
  type PlanId,
} from '@/lib/purchases';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

// Uniquement des features livrées — ne jamais vendre ce qui n'existe pas encore
const FEATURES = [
  'Montres illimitées — 5 en gratuit',
  'Tableau de bord patrimonial : valeur & plus-value',
  "Rapport d'expert IA sur chaque montre",
  'Alertes de prix sur votre wishlist',
  'Cote actualisée chaque semaine — mensuelle en gratuit',
  'Reconnaissances photo illimitées',
];

const STUB_MESSAGE =
  'Profitez de toutes les fonctionnalités — les abonnements arriveront plus tard.';

/** Paywall partagé : onboarding (premium.tsx) et modal /paywall dans l'app. */
export function PaywallView({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanId>('annual');
  const [busy, setBusy] = useState(false);
  // Prix réels localisés du store quand disponibles — fallback zone euro en stub
  const [prices, setPrices] = useState<OfferingPrices | null>(null);
  useEffect(() => {
    getOfferingPrices().then(setPrices);
  }, []);

  function refreshEntitlement() {
    // L'entitlement serveur arrive par le webhook RevenueCat — on invalide,
    // le retard éventuel se rattrape au refetch suivant
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['portfolio'] });
  }

  async function subscribe() {
    setBusy(true);
    try {
      const result = await purchasePlan(plan);
      if (result === 'stub') {
        Alert.alert('Watchy est gratuit pendant la bêta', STUB_MESSAGE, [
          { text: 'Continuer', onPress: onDone },
        ]);
      } else if (result === 'done') {
        refreshEntitlement();
        Alert.alert('Bienvenue dans Premium', 'Toute votre collection est débloquée.', [
          { text: 'Continuer', onPress: onDone },
        ]);
      }
    } catch (err) {
      Alert.alert('Achat impossible', err instanceof Error ? err.message : 'Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const result = await restorePurchases();
      if (result === 'stub') {
        Alert.alert('Restaurer', 'Aucun achat à restaurer pendant la bêta.');
      } else if (result === 'done') {
        refreshEntitlement();
        Alert.alert('Achats restaurés', 'Votre abonnement Premium est actif.', [
          { text: 'Continuer', onPress: onDone },
        ]);
      } else {
        Alert.alert('Restaurer', 'Aucun abonnement actif trouvé pour ce compte.');
      }
    } catch (err) {
      Alert.alert('Restauration impossible', err instanceof Error ? err.message : 'Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three },
      ]}
    >
      <ScreenBackground />

      <Pressable onPress={onDone} style={styles.close} hitSlop={8} disabled={busy}>
        <SymbolView name="xmark" size={15} tintColor={Brand.inkSecondary} />
      </Pressable>

      <View style={styles.body}>
        <ThemedText type="title" style={styles.title}>
          Watchy Premium
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          De l'inventaire à la gestion de patrimoine.
        </ThemedText>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.feature}>
              <ThemedText type="smallBold" style={styles.featureStar}>
                ✦
              </ThemedText>
              <ThemedText type="default" style={styles.featureText}>
                {f}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Offres */}
        <View style={styles.plans}>
          <Pressable onPress={() => setPlan('annual')} disabled={busy}>
            <GlassCard style={[styles.planCard, plan === 'annual' && styles.planActive]}>
              <View style={styles.planBadge}>
                <ThemedText type="delta" style={styles.planBadgeText}>
                  −33 %
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={styles.planName}>
                Annuel
              </ThemedText>
              <ThemedText type="hero" style={styles.planPrice}>
                {prices?.annual ?? '39,99 €'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                soit {prices?.annualPerMonth ?? '3,33 €'}/mois
              </ThemedText>
            </GlassCard>
          </Pressable>
          <Pressable onPress={() => setPlan('monthly')} disabled={busy}>
            <GlassCard style={[styles.planCard, plan === 'monthly' && styles.planActive]}>
              <ThemedText type="smallBold" style={styles.planName}>
                Mensuel
              </ThemedText>
              <ThemedText type="hero" style={styles.planPrice}>
                {prices?.monthly ?? '4,99 €'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                par mois
              </ThemedText>
            </GlassCard>
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Essai gratuit de 7 jours" onPress={subscribe} loading={busy} />
        <View style={styles.secondaryRow}>
          <Pressable onPress={restore} hitSlop={8} disabled={busy}>
            <ThemedText type="small" themeColor="interactive">
              Restaurer les achats
            </ThemedText>
          </Pressable>
          <Pressable onPress={onDone} hitSlop={8} disabled={busy}>
            <ThemedText type="small" themeColor="textSecondary">
              Peut-être plus tard
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
          Puis {prices?.annual ?? '39,99 €'}/an, renouvellement automatique, résiliable à tout
          moment.{' '}
          <ThemedText
            type="small"
            themeColor="interactive"
            onPress={() => router.push('/legal/terms')}
          >
            CGUV (EULA)
          </ThemedText>{' '}
          ·{' '}
          <ThemedText
            type="small"
            themeColor="interactive"
            onPress={() => router.push('/legal/privacy')}
          >
            Confidentialité
          </ThemedText>
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
    justifyContent: 'space-between',
  },
  close: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  features: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.one,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  featureStar: {
    color: Brand.accent,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
  },
  plans: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
    justifyContent: 'center',
  },
  planCard: {
    width: 150,
    gap: 2,
    borderRadius: Radii.card,
  },
  planActive: {
    borderColor: Brand.accent,
    borderWidth: 1.5,
  },
  planBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(64,128,90,0.14)',
    borderRadius: Radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  planBadgeText: {
    color: Brand.positive,
  },
  planName: {
    fontSize: 13,
  },
  planPrice: {
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 22,
    lineHeight: 27,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingVertical: Spacing.one,
  },
  legal: {
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 14,
  },
});
