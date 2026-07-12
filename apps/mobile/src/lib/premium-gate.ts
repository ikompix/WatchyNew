import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ApiRequestError } from './api-client';
import { getActiveLocale, t } from './i18n';
import { getConsumablePrice, purchaseConsumable, type ConsumableId } from './purchases';
import { queryClient } from './query-client';

const GATED_CODES = new Set(['QUOTA_EXCEEDED', 'SCAN_QUOTA_EXCEEDED', 'PREMIUM_REQUIRED']);

// Pack consommable proposé en alternative à l'abonnement selon le quota touché
const PACKS: Record<string, { id: ConsumableId; labelKey: string }> = {
  SCAN_QUOTA_EXCEEDED: { id: 'watchy_scans_5', labelKey: 'packs.scanPack' },
  QUOTA_EXCEEDED: { id: 'watchy_slots_3', labelKey: 'packs.slotPack' },
};

/**
 * Erreur de blocage freemium → alerte avec CTA vers le paywall, et le pack
 * consommable en option secondaire quand le quota en a un (scans,
 * emplacements). Premium reste l'option mise en avant (premier bouton).
 * Retourne false si l'erreur n'est pas un gate (l'appelant garde sa gestion habituelle).
 */
export function handlePremiumGate(err: unknown, title?: string): boolean {
  if (!(err instanceof ApiRequestError) || !GATED_CODES.has(err.code)) return false;
  const pack = PACKS[err.code];
  const alertTitle = title ?? t('premiumGate.limitTitle');
  const message = apiErrorMessage(err);

  if (!pack) {
    Alert.alert(alertTitle, message, [
      { text: t('common.later'), style: 'cancel' },
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
    ]);
    return true;
  }

  // Le prix vient du store (async) — sans prix (stub Expo Go, produit absent),
  // l'alerte retombe sur les deux boutons habituels
  void (async () => {
    const price = await getConsumablePrice(pack.id).catch(() => null);
    Alert.alert(alertTitle, message, [
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
      ...(price
        ? [{ text: t(pack.labelKey, { price }), onPress: () => buyPack(pack.id) }]
        : []),
      { text: t('common.later'), style: 'cancel' as const },
    ]);
  })();
  return true;
}

async function buyPack(id: ConsumableId): Promise<void> {
  try {
    const result = await purchaseConsumable(id);
    if (result !== 'done') return;
    // Le crédit serveur arrive via le webhook RevenueCat (latence 1-5 s)
    Alert.alert(t('packs.pendingTitle'), t('packs.pendingMessage'));
    queryClient.invalidateQueries({ queryKey: ['me'] });
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ['me'] }), 5000);
  } catch (err) {
    Alert.alert(t('packs.buyErrorTitle'), apiErrorMessage(err));
  }
}

/**
 * Message d'erreur API localisé. Les messages serveur sont en français (et
 * portent les valeurs dynamiques : quotas…) — on les garde tels quels en FR.
 * En anglais, on traduit par code métier via `errors.{CODE}`, sinon on
 * retombe sur le message serveur.
 */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && getActiveLocale() !== 'fr') {
    const translated = t(`errors.${err.code}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return err instanceof Error ? err.message : t('common.tryAgain');
}
