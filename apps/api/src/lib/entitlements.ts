import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entitlements, recognitionEvents, watches, wishlistItems } from '../db/schema.js';
import type { Plan } from '@watchy/types';

// Quota free COMBINÉ : 5 emplacements en tout, collection + wishlist confondues
export const FREE_SLOT_LIMIT = 5;
export const FREE_SCANS_PER_MONTH = 5;
// La fraîcheur de cote est monétisée : rafraîchissement auto hebdomadaire en
// premium, mensuel en free (chaque recherche de cote coûte un appel IA + web)
export const STALE_DAYS_PREMIUM = 7;
export const STALE_DAYS_FREE = 30;

/** Plan effectif : absence de ligne ou premium expiré = free. */
export async function getPlan(userId: string): Promise<Plan> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  if (!row || row.plan !== 'premium') return 'free';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return 'free';
  return 'premium';
}

export async function countWatches(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(watches)
    .where(eq(watches.userId, userId));
  return row?.value ?? 0;
}

export async function countWishlist(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return row?.value ?? 0;
}

/** Emplacements occupés = montres en collection + items de wishlist. */
export async function countSlots(userId: string): Promise<number> {
  const [w, wl] = await Promise.all([countWatches(userId), countWishlist(userId)]);
  return w + wl;
}

/**
 * Éléments verrouillés d'un compte free : au-delà des FREE_SLOT_LIMIT plus
 * anciens (collection + wishlist confondues, createdAt croissant), tout est
 * verrouillé — jamais supprimé. Calcul dynamique : supprimer un élément ou
 * repasser premium déverrouille sans migration.
 */
export async function getLockedIds(
  userId: string
): Promise<{ watchIds: Set<string>; wishlistIds: Set<string> }> {
  const none = { watchIds: new Set<string>(), wishlistIds: new Set<string>() };
  if ((await getPlan(userId)) === 'premium') return none;

  const [watchRows, wishlistRows] = await Promise.all([
    db
      .select({ id: watches.id, createdAt: watches.createdAt })
      .from(watches)
      .where(eq(watches.userId, userId)),
    db
      .select({ id: wishlistItems.id, createdAt: wishlistItems.createdAt })
      .from(wishlistItems)
      .where(eq(wishlistItems.userId, userId)),
  ]);

  const all = [
    ...watchRows.map((r) => ({ ...r, kind: 'watch' as const })),
    ...wishlistRows.map((r) => ({ ...r, kind: 'wishlist' as const })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const item of all.slice(FREE_SLOT_LIMIT)) {
    (item.kind === 'watch' ? none.watchIds : none.wishlistIds).add(item.id);
  }
  return none;
}

/** Reconnaissances lancées sur le mois calendaire en cours (UTC). */
export async function countScansThisMonth(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ value: count() })
    .from(recognitionEvents)
    .where(
      and(eq(recognitionEvents.userId, userId), gte(recognitionEvents.createdAt, monthStart))
    );
  return row?.value ?? 0;
}
