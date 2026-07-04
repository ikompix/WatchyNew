import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { isGuestEmail } from '@/lib/onboarding';
import { presentCustomerCenter, restorePurchases } from '@/lib/purchases';
import { apiDelete, unwrap } from '@/lib/api-client';
import { useMe } from '@/hooks/use-entitlement';
import { Brand, CardGap, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const { data: me } = useMe();
  const isPremium = me?.plan === 'premium';

  useEffect(() => {
    // Session locale (pas d'appel réseau) — l'email y est déjà
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // Exigence App Store 5.1.1(v) : suppression du compte in-app, définitive
  function handleDeleteAccount() {
    Alert.alert(
      'Supprimer mon compte',
      'Votre compte, votre collection, vos photos et votre wishlist seront définitivement effacés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            try {
              unwrap(await apiDelete<{ deleted: true }>('/me'));
              await supabase.auth.signOut();
            } catch (err) {
              Alert.alert(
                'Suppression impossible',
                err instanceof Error ? err.message : 'Réessayez ou contactez-nous.'
              );
            }
          },
        },
      ]
    );
  }

  async function handleSubscription() {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    // Customer Center RevenueCat quand dispo (gestion/annulation in-app) ;
    // sinon fallback Réglages iOS + restauration
    if (await presentCustomerCenter()) return;
    Alert.alert('Abonnement Premium', 'Votre abonnement est actif.', [
      {
        text: 'Gérer dans les Réglages',
        onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions'),
      },
      {
        text: 'Restaurer mes achats',
        onPress: async () => {
          const result = await restorePurchases().catch(() => 'none' as const);
          if (result === 'done') qc.invalidateQueries({ queryKey: ['me'] });
          Alert.alert(
            'Restaurer',
            result === 'done' ? 'Abonnement restauré.' : 'Aucun abonnement trouvé pour ce compte.'
          );
        },
      },
      { text: 'Fermer', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <View style={{ paddingTop: insets.top + 56 }}>
        <View style={styles.header}>
          <ThemedText type="title">Profil</ThemedText>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <SymbolView name="envelope" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              {isGuestEmail(email) ? (
                <>
                  <ThemedText type="smallBold">Compte invité</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Créez un compte pour sécuriser vos données
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Email
                  </ThemedText>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {email ?? '…'}
                  </ThemedText>
                </>
              )}
            </View>
          </View>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={handleSubscription}>
            <View style={styles.rowIcon}>
              <SymbolView
                name={isPremium ? 'crown.fill' : 'crown'}
                size={16}
                tintColor={Brand.accent}
              />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="small" themeColor="textSecondary">
                Abonnement
              </ThemedText>
              <ThemedText type="smallBold">
                {me == null
                  ? '…'
                  : isPremium
                    ? 'Premium'
                    : `Gratuit · ${me.watchCount}/${me.watchLimit} montres`}
              </ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push('/legal/terms')}>
            <View style={styles.rowIcon}>
              <SymbolView name="doc.text" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">Conditions d'utilisation</ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={() => router.push('/legal/privacy')}>
            <View style={styles.rowIcon}>
              <SymbolView name="lock.shield" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">Politique de confidentialité</ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={handleSignOut}>
            <View style={styles.rowIcon}>
              <SymbolView
                name="rectangle.portrait.and.arrow.right"
                size={16}
                tintColor={Brand.negative}
              />
            </View>
            <ThemedText type="default" themeColor="negative">
              Se déconnecter
            </ThemedText>
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowIcon}>
              <SymbolView name="trash" size={16} tintColor={Brand.negative} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="default" themeColor="negative">
                Supprimer mon compte
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Efface définitivement toutes vos données
              </ThemedText>
            </View>
          </Pressable>
        </GlassCard>

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
          Watchy {Constants.expoConfig?.version ?? ''}
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
  },
  header: {
    marginBottom: Spacing.four,
  },
  card: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: Radii.field,
    marginBottom: CardGap,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(91,127,166,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.07)',
    marginHorizontal: Spacing.three,
  },
  version: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
});
