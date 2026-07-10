import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { t } from './i18n';

const ONBOARDED_KEY = 'watchy_onboarded';
const ANALYTICS_KEY = 'watchy_analytics_optin';

export async function getOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDED_KEY)) === '1';
}

export async function setOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDED_KEY, '1');
}

export async function getAnalyticsOptIn(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ANALYTICS_KEY)) === '1';
}

export async function setAnalyticsOptIn(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(ANALYTICS_KEY, value ? '1' : '0');
}

/**
 * « Continuer sans compte » : l'API crée un compte invité (service role) et
 * on ouvre une session normale avec — RLS et upgrade ultérieur inchangés.
 */
export async function signInAsGuest(): Promise<void> {
  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/auth/guest`, { method: 'POST' });
  const json = (await res.json()) as {
    data: { email: string; password: string } | null;
    error: { message: string } | null;
  };
  if (!json.data) throw new Error(json.error?.message ?? t('onboardingLib.guestError'));

  const { error } = await supabase.auth.signInWithPassword(json.data);
  if (error) throw new Error(error.message);
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith('@guest.watchy'));
}
