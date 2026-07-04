import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ApiRequestError } from './api-client';

const GATED_CODES = new Set(['QUOTA_EXCEEDED', 'SCAN_QUOTA_EXCEEDED', 'PREMIUM_REQUIRED']);

/**
 * Erreur de blocage freemium → alerte avec CTA vers le paywall.
 * Retourne false si l'erreur n'est pas un gate (l'appelant garde sa gestion habituelle).
 */
export function handlePremiumGate(err: unknown, title = 'Limite atteinte'): boolean {
  if (!(err instanceof ApiRequestError) || !GATED_CODES.has(err.code)) return false;
  Alert.alert(title, err.message, [
    { text: 'Plus tard', style: 'cancel' },
    { text: 'Voir Premium', onPress: () => router.push('/paywall') },
  ]);
  return true;
}
