import type { Context } from 'hono';

export type Locale = 'fr' | 'en';

/**
 * Locale d'affichage du client via Accept-Language (envoyé par l'app mobile).
 * Défaut : fr — langue historique de l'app et des données existantes.
 */
export function getLocale(c: Context): Locale {
  const header = c.req.header('Accept-Language') ?? '';
  return header.trim().toLowerCase().startsWith('en') ? 'en' : 'fr';
}
