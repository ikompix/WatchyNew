import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entitlements } from '../db/schema.js';
import type { ApiResponse } from '@watchy/types';

// Monté SANS authMiddleware : RevenueCat s'authentifie par le header
// Authorization configuré dans son dashboard (REVENUECAT_WEBHOOK_SECRET).
const router = new Hono();

// CANCELLATION volontaire = auto-renew coupé mais accès actif jusqu'à
// l'échéance — c'est l'event EXPIRATION qui repasse en free.
const PREMIUM_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  expiration_at_ms?: number | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
