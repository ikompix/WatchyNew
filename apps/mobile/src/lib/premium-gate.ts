import { Alert, type AlertButton } from 'react-native';
import { router } from 'expo-router';
import { ApiRequestError } from './api-client';
import { getActiveLocale, t } from './i18n';
import { getConsumablePrice, purchaseConsumable, type ConsumableId } from './purchases';
import { queryClient } from './query-client';
import type { MeResult } from '@watchy/types';

const GATED_CODES = new Set(['QUOTA_EXCEEDED', 'PREMIUM_REQUIRED']);

export type SlotPool = 'collection' | 'wishlist';

// Pack +1 emplacement proposé en alternative à l'abonnement, selon le pool
const SLOT_PACKS: Record<SlotPool, { id: ConsumableId; labelKey: string }> = {
  collection: { id: 'watchy_watch_slot_1', labelKey: 'packs.watchSlot' },
  wishlist: { id: 'watchy_wishlist_slot_1', labelKey: 'packs.wishlistSlot' },
};

/**
 * Bouton « +1 emplacement — prix » prêt à insérer dans une alerte, ou null
 * sans prix (stub Expo Go, produit absent du store).
 */
export async function slotPackButton(pool: SlotPool): Promise<AlertButton | null> {
  const pack = SLOT_PACKS[pool];
  const price = await getConsumablePrice(pack.id).catch(() => null);
  if (!price) return null;
  return { text: t(pack.labelKey, { price }), onPress: () => buyPack(pack.id) };
}

/**
 * Erreur de blocage freemium → alerte avec CTA vers le paywall, et le pack
 * +1 emplacement du pool concerné en option secondaire quand le quota en a un
 * (QUOTA_EXCEEDED). Premium reste l'option mise en avant (premier bouton).
 * Retourne false si l'erreur n'est pas un gate (l'appelant garde sa gestion habituelle).
 */
export function handlePremiumGate(
  err: unknown,
  title?: string,
  pool: SlotPool = 'collection'
): boolean {
  if (!(err instanceof ApiRequestError) || !GATED_CODES.has(err.code)) return false;
  const alertTitle = title ?? t('premiumGate.limitTitle');
  const message = apiErrorMessage(err);

  if (err.code !== 'QUOTA_EXCEEDED') {
    Alert.alert(alertTitle, message, [
      { text: t('common.later'), style: 'cancel' },
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
    ]);
    return true;
  }

  // Le prix vient du store (async) — sans prix, l'alerte retombe sur les deux
  // boutons habituels
  void (async () => {
    const packBtn = await slotPackButton(pool);
    Alert.alert(alertTitle, message, [
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
      ...(packBtn ? [packBtn] : []),
      { text: t('common.later'), style: 'cancel' as const },
    ]);
  })();
  return true;
}

/**
 * Pré-check client avant d'ouvrir la caméra/galerie : true si le pool est
 * plein en free → alerte « Pas d'emplacement disponible » et on bloque (le
 * scan coûte un appel IA, inutile s'il ne peut pas aboutir). `me` absent ou
 * limite null (premium) → ne bloque pas, la défense serveur couvre.
 */
export function blockIfPoolFull(me: MeResult | undefined, pool: SlotPool): boolean {
  if (!me) return false;
  const limit = pool === 'wishlist' ? me.wishlistSlotsLimit : me.watchSlotsLimit;
  const used = pool === 'wishlist' ? me.wishlistCount : me.watchCount;
  if (limit == null || used < limit) return false;

  const message = t(
    pool === 'wishlist' ? 'premiumGate.noSlotWishlist' : 'premiumGate.noSlotCollection',
    { limit }
  );
  void (async () => {
    const packBtn = await slotPackButton(pool);
    Alert.alert(t('premiumGate.noSlotTitle'), message, [
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
      ...(packBtn ? [packBtn] : []),
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
