import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  entitlements,
  featureInterest,
  pushTokens,
  recognitionEvents,
  watches,
  wishlistItems,
} from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  countScansThisMonth,
  countWatches,
  FREE_SCANS_PER_MONTH,
  FREE_WATCH_LIMIT,
  getPlan,
} from '../lib/entitlements.js';
import type { ApiResponse, MeResult } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

router.get('/', async (c) => {
  const userId = c.get('userId');
  const [plan, watchCount, scansUsed] = await Promise.all([
    getPlan(userId),
    countWatches(userId),
    countScansThisMonth(userId),
  ]);

  return c.json<ApiResponse<MeResult>>({
    data: {
      plan,
      watchCount,
      watchLimit: plan === 'premium' ? null : FREE_WATCH_LIMIT,
      scansUsed,
      scansLimit: plan === 'premium' ? null : FREE_SCANS_PER_MONTH,
    },
    error: null,
  });
});

const pushTokenSchema = z.object({ token: z.string().min(10).max(400) });

/** Enregistre le jeton Expo Push de l'appareil (upsert — un token change d'utilisateur au re-login). */
router.post('/push-token', async (c) => {
  const userId = c.get('userId');
  const parsed = pushTokenSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  await db
    .insert(pushTokens)
    .values({ token: parsed.data.token, userId })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, updatedAt: new Date() },
    });
  return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
});

// Features teasées dans l'app — étendre l'enum au fil des teasers
const interestSchema = z.object({ feature: z.enum(['community']) });

/** « Me prévenir » — enregistre l'intérêt pour une feature à venir (idempotent). */
router.post('/feature-interest', async (c) => {
  const userId = c.get('userId');
  const parsed = interestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  await db
    .insert(featureInterest)
    .values({ userId, feature: parsed.data.feature })
    .onConflictDoNothing();
  return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
});

router.get('/feature-interest', async (c) => {
  const userId = c.get('userId');
  const rows = await db
    .select({ feature: featureInterest.feature })
    .from(featureInterest)
    .where(eq(featureInterest.userId, userId));
  return c.json<ApiResponse<{ features: string[] }>>({
    data: { features: rows.map((r) => r.feature) },
    error: null,
  });
});

/**
 * Suppression de compte (exigence App Store 5.1.1(v) + RGPD) : efface toutes
 * les données applicatives, les photos de l'utilisateur, puis le compte auth.
 * Les photos de modèles (models/) sont partagées et ne sont pas touchées.
 */
router.delete('/', async (c) => {
  const userId = c.get('userId');

  // Données applicatives — watches en premier (cascade expert_reports et
  // market_prices de variante via FK)
  await db.delete(watches).where(eq(watches.userId, userId));
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
  await db.delete(recognitionEvents).where(eq(recognitionEvents.userId, userId));
  await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
  await db.delete(featureInterest).where(eq(featureInterest.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));

  // Photos de l'utilisateur (dossier {userId}/ du bucket) — best-effort,
  // la suppression du compte ne doit pas échouer sur le storage
  try {
    const { data: files } = await supabaseAdmin.storage.from('watch-photos').list(userId);
    if (files?.length) {
      await supabaseAdmin.storage
        .from('watch-photos')
        .remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (err) {
    console.error(`[delete-account] purge storage ${userId}:`, err);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'DELETE_FAILED', message: error.message } },
      500
    );
  }
  console.log(`[delete-account] compte ${userId} supprimé`);
  return c.json<ApiResponse<{ deleted: true }>>({ data: { deleted: true }, error: null });
});

export { router as meRouter };
