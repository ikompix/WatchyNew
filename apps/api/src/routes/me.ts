import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  acquisitionSources,
  aiUsage,
  entitlements,
  featureInterest,
  profiles,
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
  countWishlist,
  FREE_SCANS_PER_MONTH,
  FREE_SLOT_LIMIT,
  getPlan,
} from '../lib/entitlements.js';
import type { ApiResponse, MeResult, UserProfile } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

router.get('/', async (c) => {
  const userId = c.get('userId');
  const [plan, watchCount, wishlistCount, scansUsed] = await Promise.all([
    getPlan(userId),
    countWatches(userId),
    countWishlist(userId),
    countScansThisMonth(userId),
  ]);

  return c.json<ApiResponse<MeResult>>({
    data: {
      plan,
      watchCount,
      wishlistCount,
      slotsUsed: watchCount + wishlistCount,
      slotsLimit: plan === 'premium' ? null : FREE_SLOT_LIMIT,
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

const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;
const EXPERTISES = ['novice', 'passionne', 'collectionneur', 'metier'] as const;
const profileSchema = z.object({
  ageRange: z.enum(AGE_RANGES).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(60).nullable().optional(),
  expertise: z.enum(EXPERTISES).nullable().optional(),
});

/** Profil déclaratif facultatif — champs non sensibles uniquement (tranche d'âge, ville/pays, expertise). */
router.get('/profile', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return c.json<ApiResponse<UserProfile>>({
    data: {
      ageRange: row?.ageRange ?? null,
      city: row?.city ?? null,
      country: row?.country ?? null,
      expertise: row?.expertise ?? null,
    } as UserProfile,
    error: null,
  });
});

router.patch('/profile', async (c) => {
  const userId = c.get('userId');
  const parsed = profileSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  // Upsert partiel : seuls les champs envoyés changent ('' ⇒ null)
  const clean = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === '' ? null : v])
  );
  const [row] = await db
    .insert(profiles)
    .values({ userId, ...clean })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...clean, updatedAt: new Date() } })
    .returning();
  return c.json<ApiResponse<UserProfile>>({
    data: {
      ageRange: row.ageRange,
      city: row.city,
      country: row.country,
      expertise: row.expertise,
    } as UserProfile,
    error: null,
  });
});

const acquisitionSchema = z.object({ source: z.string().min(1).max(40) });

/** « Comment nous avez-vous connu ? » (onboarding, facultatif, upsert). */
router.post('/acquisition-source', async (c) => {
  const userId = c.get('userId');
  const parsed = acquisitionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  await db
    .insert(acquisitionSources)
    .values({ userId, source: parsed.data.source })
    .onConflictDoUpdate({
      target: acquisitionSources.userId,
      set: { source: parsed.data.source },
    });
  return c.json<ApiResponse<{ ok: true }>>({ data: { ok: true }, error: null });
});

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

  // Données applicatives — watches en premier (cascade market_prices de
  // variante via FK)
  await db.delete(watches).where(eq(watches.userId, userId));
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
  await db.delete(recognitionEvents).where(eq(recognitionEvents.userId, userId));
  await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
  await db.delete(featureInterest).where(eq(featureInterest.userId, userId));
  await db.delete(acquisitionSources).where(eq(acquisitionSources.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  // Coûts IA : anonymisés (RGPD) mais conservés pour les agrégats du back office
  await db.update(aiUsage).set({ userId: null }).where(eq(aiUsage.userId, userId));
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
