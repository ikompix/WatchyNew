import { and, count, eq, gt, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  entitlements,
  recognitionEvents,
  scanCredits,
  watches,
  wishlistItems,
} from '../db/schema.js';
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

/**
 * Limite d'emplacements effective : null = illimité (premium), sinon les 5
 * gratuits + les emplacements achetés à l'unité (extra_slots, permanents —
 * ils comptent même après l'expiration d'un abonnement).
 */
export async function getSlotLimit(userId: string): Promise<number | null> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  const isPremium =
    row?.plan === 'premium' && (!row.expiresAt || row.expiresAt.getTime() >= Date.now());
  if (isPremium) return null;
  return FREE_SLOT_LIMIT + (row?.extraSlots ?? 0);
}

/** Utilisateurs premium actifs (même définition que la page Revenus du BO). */
export async function premiumUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: entitlements.userId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.plan, 'premium'),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date()))
      )
    );
  return rows.map((r) => r.userId);
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
 * Éléments verrouillés d'un compte free : au-delà de la limite (5 gratuits +
 * emplacements achetés) les plus anciens (collection + wishlist confondues,
 * createdAt croissant), tout est verrouillé — jamais supprimé. Calcul
 * dynamique : supprimer un élément, acheter des emplacements ou repasser
 * premium déverrouille sans migration.
 */
export async function getLockedIds(
  userId: string
): Promise<{ watchIds: Set<string>; wishlistIds: Set<string> }> {
  const none = { watchIds: new Set<string>(), wishlistIds: new Set<string>() };
  const limit = await getSlotLimit(userId);
  if (limit == null) return none;

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

  for (const item of all.slice(limit)) {
    (item.kind === 'watch' ? none.watchIds : none.wishlistIds).add(item.id);
  }
  return none;
}

/** Solde de crédits de scans achetés (packs consommables) — sum(delta) du ledger. */
export async function getScanCredits(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(sum(${scanCredits.delta}), 0)::int` })
    .from(scanCredits)
    .where(eq(scanCredits.userId, userId));
  return row?.value ?? 0;
}

/** Consomme un crédit de scan (le quota mensuel gratuit s'épuise d'abord). */
export async function consumeScanCredit(userId: string): Promise<void> {
  await db.insert(scanCredits).values({ userId, delta: -1, reason: 'scan' });
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
