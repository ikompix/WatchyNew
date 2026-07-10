import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ApiRequestError } from './api-client';
import { getActiveLocale, t } from './i18n';

const GATED_CODES = new Set(['QUOTA_EXCEEDED', 'SCAN_QUOTA_EXCEEDED', 'PREMIUM_REQUIRED']);

/**
 * Erreur de blocage freemium → alerte avec CTA vers le paywall.
 * Retourne false si l'erreur n'est pas un gate (l'appelant garde sa gestion habituelle).
 */
export function handlePremiumGate(err: unknown, title?: string): boolean {
  if (!(err instanceof ApiRequestError) || !GATED_CODES.has(err.code)) return false;
  Alert.alert(title ?? t('premiumGate.limitTitle'), apiErrorMessage(err), [
    { text: t('common.later'), style: 'cancel' },
    { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
  ]);
  return true;
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
