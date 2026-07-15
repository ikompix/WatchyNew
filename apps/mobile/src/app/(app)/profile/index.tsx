import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { isGuestEmail } from '@/lib/onboarding';
import { enablePushNotifications } from '@/lib/push';
import { presentCustomerCenter, restorePurchases } from '@/lib/purchases';
import { apiDelete, unwrap } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/premium-gate';
import { useMe } from '@/hooks/use-entitlement';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/hooks/use-notification-prefs';
import { Brand, CardGap, Gutter, Radii, Spacing } from '@/constants/theme';
import { useLocaleStore, useT, type LocaleOverride } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { WatchyMark } from '@/components/watchy-mark';

export default function Profile() {
  const t = useT();
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
    Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccountConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            unwrap(await apiDelete<{ deleted: true }>('/me'));
            await supabase.auth.signOut();
          } catch (err) {
            Alert.alert(t('profile.deleteAccountErrorTitle'), apiErrorMessage(err));
          }
        },
      },
    ]);
  }

  // Langue : automatique (appareil) ou forcée — persiste et re-rend immédiatement
  const { override, setOverride } = useLocaleStore();
  const languageValue =
    override === null ? t('profile.languageAuto') : override === 'fr' ? 'Français' : 'English';
  function handleLanguage() {
    const pick = (value: LocaleOverride) => () => setOverride(value);
    Alert.alert(t('profile.languageTitle'), undefined, [
      { text: t('profile.languageAuto'), onPress: pick(null) },
      { text: 'Français', onPress: pick('fr') },
      { text: 'English', onPress: pick('en') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  // Notifications : reflète la permission système, re-vérifiée au retour des
  // Réglages (AppState) — l'activation réelle passe par le prompt iOS
  const [notifStatus, setNotifStatus] = useState<Notifications.PermissionStatus | null>(null);
  useEffect(() => {
    const check = () => Notifications.getPermissionsAsync().then((p) => setNotifStatus(p.status));
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // Alertes de cote (premium) : préférence serveur, indépendante de la
  // permission système (qui reste la première barrière)
  const notifPrefs = useNotificationPrefs(isPremium);
  const updatePrefs = useUpdateNotificationPrefs();

  async function handleNotifications() {
    if (notifStatus === 'granted') return;
    if (notifStatus === 'denied') {
      // Le prompt système ne peut plus être ré-affiché : direction Réglages
      Linking.openSettings();
      return;
    }
    const ok = await enablePushNotifications();
    setNotifStatus(
      ok ? Notifications.PermissionStatus.GRANTED : Notifications.PermissionStatus.DENIED
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
    Alert.alert(t('profile.subscriptionTitle'), t('profile.subscriptionActive'), [
      {
        text: t('profile.manageInSettings'),
        onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions'),
      },
      {
        text: t('profile.restorePurchases'),
        onPress: async () => {
          const result = await restorePurchases().catch(() => 'none' as const);
          if (result === 'done') qc.invalidateQueries({ queryKey: ['me'] });
          Alert.alert(
            t('paywall.restoreTitle'),
            result === 'done' ? t('profile.restored') : t('profile.restoreNone')
          );
        },
      },
      { text: t('profile.close'), style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <View style={{ paddingTop: insets.top + 56 }}>
        <View style={styles.header}>
          <ThemedText type="title">{t('profile.title')}</ThemedText>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <SymbolView name="envelope" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              {isGuestEmail(email) ? (
                <>
                  <ThemedText type="smallBold">{t('profile.guestAccount')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('profile.guestSubtitle')}
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('profile.emailLabel')}
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
                {t('profile.subscriptionLabel')}
              </ThemedText>
              <ThemedText type="smallBold">
                {me == null
                  ? '…'
                  : isPremium
                    ? 'Premium'
                    : t('profile.freePlan', {
                        watches: me.watchCount,
                        watchLimit: me.watchSlotsLimit,
                        wishlist: me.wishlistCount,
                        wishlistLimit: me.wishlistSlotsLimit,
                      })}
              </ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push('/profile-edit')}>
            <View style={styles.rowIcon}>
              <SymbolView name="person.text.rectangle" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('profile.myInfo')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.myInfoSubtitle')}
              </ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={handleLanguage}>
            <View style={styles.rowIcon}>
              <SymbolView name="globe" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('profile.language')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {languageValue}
              </ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={handleNotifications}>
            <View style={styles.rowIcon}>
              <SymbolView name="bell.badge" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('profile.notifications')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {notifStatus == null
                  ? '…'
                  : notifStatus === 'granted'
                    ? t('profile.notificationsOn')
                    : t('profile.notificationsOff')}
              </ThemedText>
            </View>
            {notifStatus !== 'granted' && (
              <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
            )}
          </Pressable>
          <View style={styles.rowDivider} />
          {isPremium ? (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <SymbolView name="chart.line.uptrend.xyaxis" size={16} tintColor={Brand.accent} />
              </View>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{t('profile.priceAlerts')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('profile.priceAlertsSubtitle')}
                </ThemedText>
              </View>
              <Switch
                value={notifPrefs.data?.priceAlerts ?? true}
                onValueChange={(value) => updatePrefs.mutate({ priceAlerts: value })}
                disabled={notifPrefs.isLoading}
              />
            </View>
          ) : (
            <Pressable style={styles.row} onPress={() => router.push('/paywall')}>
              <View style={styles.rowIcon}>
                <SymbolView name="lock.fill" size={16} tintColor={Brand.inkSecondary} />
              </View>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{t('profile.priceAlerts')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('profile.priceAlertsLocked')}
                </ThemedText>
              </View>
              <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
            </Pressable>
          )}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push('/legal/terms')}>
            <View style={styles.rowIcon}>
              <SymbolView name="doc.text" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('legal.termsTitle')}</ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={() => router.push('/legal/privacy')}>
            <View style={styles.rowIcon}>
              <SymbolView name="lock.shield" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('legal.privacyTitle')}</ThemedText>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={Brand.inkSecondary} />
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={() => router.push('/legal/mentions')}>
            <View style={styles.rowIcon}>
              <SymbolView name="building.columns" size={16} tintColor={Brand.accent} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{t('legal.noticeTitle')}</ThemedText>
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
              {t('profile.signOut')}
            </ThemedText>
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowIcon}>
              <SymbolView name="trash" size={16} tintColor={Brand.negative} />
            </View>
            <View style={styles.rowText}>
              <ThemedText type="default" themeColor="negative">
                {t('profile.deleteAccountTitle')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.deleteAccountSubtitle')}
              </ThemedText>
            </View>
          </Pressable>
        </GlassCard>

        <View style={styles.aboutFooter}>
          <WatchyMark width={28} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
            watchy {Constants.expoConfig?.version ?? ''}
          </ThemedText>
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
    backgroundColor: 'rgba(76,111,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(22,24,43,0.07)',
    marginHorizontal: Spacing.three,
  },
  aboutFooter: {
    alignItems: 'center',
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
  version: {
    textAlign: 'center',
  },
});
