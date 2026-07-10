import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from './supabase';
import { t } from './i18n';

/** Résultat homogène : 'done' = session ouverte, 'cancelled' = geste utilisateur. */
export type OAuthOutcome = 'done' | 'cancelled';

function friendly(message: string): string {
  if (/provider is not enabled|Unsupported provider/i.test(message)) {
    return t('oauth.notConfigured');
  }
  return message;
}

// Pré-vérification via l'endpoint public de settings : évite d'ouvrir un
// navigateur sur une page d'erreur JSON quand le provider n'est pas activé.
let settingsCache: Record<string, boolean> | null = null;
async function providerEnabled(name: 'apple' | 'google'): Promise<boolean> {
  if (!settingsCache) {
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! },
      });
      settingsCache = ((await res.json()) as { external: Record<string, boolean> }).external;
    } catch {
      return true; // réseau indisponible : laisser le flux normal remonter l'erreur
    }
  }
  return settingsCache?.[name] ?? true;
}

/** Sign in with Apple natif → session Supabase (signInWithIdToken). */
export async function signInWithApple(): Promise<OAuthOutcome> {
  if (!(await providerEnabled('apple'))) throw new Error(t('oauth.notConfigured'));

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    // Annulation utilisateur : pas une erreur
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error(t('oauth.appleNoToken'));
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(friendly(error.message));
  return 'done';
}

/** OAuth Google via navigateur (flux PKCE, compatible Expo Go). */
export async function signInWithGoogle(): Promise<OAuthOutcome> {
  if (!(await providerEnabled('google'))) throw new Error(t('oauth.notConfigured'));

  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(friendly(error.message));
  if (!data.url) throw new Error(t('oauth.missingUrl'));

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode || params.error_description) {
    throw new Error(friendly(params.error_description ?? errorCode ?? t('oauth.refused')));
  }
  if (!params.code) throw new Error(t('oauth.missingCode'));

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchangeError) throw new Error(friendly(exchangeError.message));
  return 'done';
}
