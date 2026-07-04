import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entitlements, recognitionEvents, watches } from '../db/schema.js';
import type { Plan } from '@watchy/types';

export const FREE_WATCH_LIMIT = 5;
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
