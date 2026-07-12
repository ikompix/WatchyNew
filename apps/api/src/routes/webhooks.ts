import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { consumablePurchases, entitlements, scanCredits } from '../db/schema.js';
import type { ApiResponse } from '@watchy/types';

// Monté SANS authMiddleware : RevenueCat s'authentifie par le header
// Authorization configuré dans son dashboard (REVENUECAT_WEBHOOK_SECRET).
const router = new Hono();

// CANCELLATION volontaire = auto-renew coupé mais accès actif jusqu'à
// l'échéance — c'est l'event EXPIRATION qui repasse en free.
const PREMIUM_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

// Packs consommables (aucun entitlement RC associé) : crédités par le webhook,
// jamais via entitlements.plan
const CONSUMABLES: Record<string, { kind: 'scans' | 'slots'; qty: number }> = {
  watchy_scans_5: { kind: 'scans', qty: 5 },
  watchy_slots_3: { kind: 'slots', qty: 3 },
};

interface RevenueCatEvent {
  // Id unique de l'event RC — clé d'idempotence (RC retente en cas de timeout)
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  cancel_reason?: string;
  expiration_at_ms?: number | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Applique l'effet d'un consommable (appelé uniquement après insert idempotent réussi). */
async function applyConsumable(
  consumable: (typeof CONSUMABLES)[string],
  userId: string,
  quantity: number,
  isRefund: boolean
): Promise<void> {
  if (consumable.kind === 'scans') {
    await db
      .insert(scanCredits)
      .values({ userId, delta: quantity, reason: isRefund ? 'refund' : 'purchase' });
  } else if (consumable.kind === 'slots') {
    // Upsert sans toucher plan/expiresAt : un premium qui achète des slots ne
    // perd pas son statut, et l'EXPIRATION d'un abonnement ne touche pas
    // extraSlots — les emplacements achetés sont permanents
    await db
      .insert(entitlements)
      .values({ userId, plan: 'free', extraSlots: Math.max(quantity, 0) })
      .onConflictDoUpdate({
        target: entitlements.userId,
        set: {
          extraSlots: sql`greatest(${entitlements.extraSlots} + ${quantity}, 0)`,
          updatedAt: new Date(),
        },
      });
  }
}

router.post('/revenuecat', async (c) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || c.req.header('Authorization') !== `Bearer ${secret}`) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook credentials' } },
      401
    );
  }

  const body = await c.req.json<{ event?: RevenueCatEvent }>().catch(() => null);
  const event = body?.event;
  if (!event?.type) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Missing event payload' } },
      400
    );
  }

  // Transfert d'achats entre comptes Apple : le premium suit le nouveau compte.
  // L'expiration exacte n'est pas dans l'event — le prochain RENEWAL/EXPIRATION
  // la corrigera.
  if (event.type === 'TRANSFER') {
    const to = (event.transferred_to ?? []).filter((id) => UUID_RE.test(id));
    const from = (event.transferred_from ?? []).filter((id) => UUID_RE.test(id));
    for (const id of to) {
      await db
        .insert(entitlements)
        .values({ userId: id, plan: 'premium', source: 'revenuecat', rcAppUserId: id })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: { plan: 'premium', source: 'revenuecat', expiresAt: null, updatedAt: new Date() },
        });
    }
    for (const id of from) {
      await db
        .update(entitlements)
        .set({ plan: 'free', expiresAt: null, updatedAt: new Date() })
        .where(eq(entitlements.userId, id));
    }
    console.log(`[revenuecat] TRANSFER: ${from.join(',') || '—'} → ${to.join(',') || '—'}`);
    return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
  }

  // appUserID est configuré côté SDK = user id Supabase ; les ids anonymes
  // RevenueCat ($RCAnonymousID:…) ne correspondent à aucun compte → ignorés en 200
  // pour ne pas déclencher de retries.
  const appUserId = event.app_user_id ?? event.original_app_user_id;
  if (!appUserId || !UUID_RE.test(appUserId)) {
    console.warn(`[revenuecat] event ${event.type} ignoré: app_user_id non reconnu`);
    return c.json<ApiResponse<{ ignored: true }>>({ data: { ignored: true }, error: null });
  }

  // Consommables : crédit à l'achat (NON_RENEWING_PURCHASE), débit au
  // remboursement (CANCELLATION). L'insert idempotent dans consumable_purchases
  // garantit qu'un retry RC ne crédite pas deux fois.
  const consumable = event.product_id ? CONSUMABLES[event.product_id] : undefined;
  if (consumable) {
    if (event.type === 'NON_RENEWING_PURCHASE' || event.type === 'CANCELLATION') {
      const isRefund = event.type === 'CANCELLATION';
      const quantity = isRefund ? -consumable.qty : consumable.qty;
      const rcEventId = event.id ?? `${event.type}:${appUserId}:${event.product_id}`;
      const [inserted] = await db
        .insert(consumablePurchases)
        .values({ rcEventId, userId: appUserId, productId: event.product_id!, quantity })
        .onConflictDoNothing({ target: consumablePurchases.rcEventId })
        .returning();
      if (inserted) {
        await applyConsumable(consumable, appUserId, quantity, isRefund);
        console.log(
          `[revenuecat] ${appUserId} ${isRefund ? 'refund' : 'achat'} ${event.product_id} (${quantity > 0 ? '+' : ''}${quantity})`
        );
      } else {
        console.log(`[revenuecat] event ${rcEventId} déjà traité — ignoré (retry RC)`);
      }
    } else {
      // Type inattendu pour un consommable — à vérifier au premier achat Test Store
      console.warn(`[revenuecat] event ${event.type} inattendu pour ${event.product_id} — ignoré`);
    }
    return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
  }

  if (PREMIUM_EVENTS.has(event.type)) {
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const productId = event.product_id ?? null;
    await db
      .insert(entitlements)
      .values({ userId: appUserId, plan: 'premium', source: 'revenuecat', productId, expiresAt, rcAppUserId: appUserId })
      .onConflictDoUpdate({
        target: entitlements.userId,
        set: { plan: 'premium', source: 'revenuecat', productId, expiresAt, rcAppUserId: appUserId, updatedAt: new Date() },
      });
    console.log(`[revenuecat] ${appUserId} → premium (${event.type})`);
  } else if (event.type === 'BILLING_ISSUE') {
    // Problème de facturation : le plan ne change pas (période de grâce Apple),
    // l'EXPIRATION suivra si le problème n'est pas résolu
    console.warn(`[revenuecat] BILLING_ISSUE pour ${appUserId} — plan inchangé`);
  } else if (event.type === 'EXPIRATION') {
    await db
      .insert(entitlements)
      .values({ userId: appUserId, plan: 'free', source: 'revenuecat', rcAppUserId: appUserId })
      .onConflictDoUpdate({
        target: entitlements.userId,
        set: { plan: 'free', expiresAt: null, updatedAt: new Date() },
      });
    console.log(`[revenuecat] ${appUserId} → free (EXPIRATION)`);
  }

  return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
});

export { router as webhooksRouter };
