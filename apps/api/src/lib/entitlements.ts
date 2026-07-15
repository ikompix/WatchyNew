import { and, count, eq, gt, gte, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entitlements, recognitionEvents, watches, wishlistItems } from '../db/schema.js';
import type { Plan } from '@watchy/types';

// Quotas free PAR POOL : 3 emplacements de collection ET 3 de wishlist,
// extensibles à l'unité (packs +1 slot, permanents)
export const FREE_WATCH_SLOTS = 3;
export const FREE_WISHLIST_SLOTS = 3;
// Garde-fou anti-abus : la reconnaissance n'a plus de quota mensuel, mais
// chaque scan coûte un appel Anthropic — plafond quotidien par utilisateur
export const MAX_SCANS_PER_DAY = 30;
// La fraîcheur de cote est monétisée : rafraîchissement auto hebdomadaire en
// premium, mensuel en free (chaque recherche de cote coûte un appel IA + web)
export const STALE_DAYS_PREMIUM = 7;
export const STALE_DAYS_FREE = 30;

export type SlotPool = 'collection' | 'wishlist';

/** Plan effectif : absence de ligne ou premium expiré = free. */
export async function getPlan(userId: string): Promise<Plan> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  if (!row || row.plan !== 'premium') return 'free';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return 'free';
  return 'premium';
}

/**
 * Limites d'emplacements par pool : null = illimité (premium), sinon les 3
 * gratuits + les emplacements achetés à l'unité (extra_*_slots, permanents —
 * ils comptent même après l'expiration d'un abonnement). Une seule lecture
 * de `entitlements` pour les deux pools.
 */
export async function getSlotLimits(
  userId: string
): Promise<{ collection: number | null; wishlist: number | null }> {
  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  const isPremium =
    row?.plan === 'premium' && (!row.expiresAt || row.expiresAt.getTime() >= Date.now());
  if (isPremium) return { collection: null, wishlist: null };
  return {
    collection: FREE_WATCH_SLOTS + (row?.extraWatchSlots ?? 0),
    wishlist: FREE_WISHLIST_SLOTS + (row?.extraWishlistSlots ?? 0),
  };
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

/**
 * Éléments verrouillés d'un compte free : chaque pool est traité séparément —
 * au-delà de sa limite (3 gratuits + emplacements achetés) les plus anciens
 * (createdAt croissant) sont verrouillés, jamais supprimés. Calcul dynamique :
 * supprimer un élément, acheter un emplacement ou repasser premium
 * déverrouille sans migration.
 */
export async function getLockedIds(
  userId: string
): Promise<{ watchIds: Set<string>; wishlistIds: Set<string> }> {
  const none = { watchIds: new Set<string>(), wishlistIds: new Set<string>() };
  const limits = await getSlotLimits(userId);
  if (limits.collection == null) return none;

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

  const byAge = (a: { createdAt: Date }, b: { createdAt: Date }) =>
    a.createdAt.getTime() - b.createdAt.getTime();
  for (const w of watchRows.sort(byAge).slice(limits.collection)) none.watchIds.add(w.id);
  for (const i of wishlistRows.sort(byAge).slice(limits.wishlist ?? 0)) {
    none.wishlistIds.add(i.id);
  }
  return none;
}

/** Reconnaissances lancées sur les dernières 24 h (garde-fou MAX_SCANS_PER_DAY). */
export async function countScansToday(userId: string): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(recognitionEvents)
    .where(and(eq(recognitionEvents.userId, userId), gte(recognitionEvents.createdAt, dayAgo)));
  return row?.value ?? 0;
}
