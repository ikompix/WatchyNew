import { Hono } from 'hono';
import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { marketPrices, watchModels, wishlistItems } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { getPlan } from '../lib/entitlements.js';
import { refreshInBackground } from '../lib/market-research.js';
import { enrichModelInBackground } from '../lib/model-photo.js';
import type { ApiResponse, WatchModel, WishlistItem } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const addSchema = z
  .object({
    watchModelId: z.string().uuid().optional(),
    brand: z.string().min(1).max(80).optional(),
    model: z.string().min(1).max(120).optional(),
    reference: z.string().max(60).optional(),
    targetPrice: z.number().positive().optional(),
  })
  .refine((v) => v.watchModelId || (v.brand && v.model), {
    message: 'watchModelId ou brand+model requis',
  });

const updateSchema = z.object({
  targetPrice: z.number().positive().nullable(),
});

const PREMIUM_ALERT_ERROR = {
  code: 'PREMIUM_REQUIRED',
  message: 'Les alertes de prix sont réservées aux membres Premium.',
};

/** La wishlist est gratuite ; poser un prix cible (= alerte) est premium. */
async function alertGateFails(userId: string, targetPrice: number | null | undefined): Promise<boolean> {
  return targetPrice != null && (await getPlan(userId)) !== 'premium';
}

/**
 * Saisie libre → find-or-create du modèle catalogue (croissance organique,
 * même esprit que la reconnaissance) : match par référence d'abord, sinon
 * brand+model exacts ; création avec cote et photo lancées en fond.
 */
async function findOrCreateModel(brand: string, model: string, reference?: string) {
  if (reference) {
    const [byRef] = await db
      .select()
      .from(watchModels)
      .where(ilike(watchModels.reference, reference))
      .limit(1);
    if (byRef) return byRef;
  }
  const [byName] = await db
    .select()
    .from(watchModels)
    .where(and(ilike(watchModels.brand, brand), ilike(watchModels.model, model)))
    .limit(1);
  if (byName) return byName;

  const canonicalName = [brand, model, reference].filter(Boolean).join(' ');
  const [created] = await db
    .insert(watchModels)
    .values({ brand, model, reference, canonicalName })
    .returning();
  console.log(`[wishlist] catalogue enrichi: ${canonicalName}`);
  refreshInBackground(created.id);
  enrichModelInBackground(created.id);
  return created;
}

router.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db
    .select({ item: wishlistItems, model: watchModels })
    .from(wishlistItems)
    .innerJoin(watchModels, eq(wishlistItems.watchModelId, watchModels.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  // Dernière cote de base par modèle en une requête (pas de N+1)
  const modelIds = [...new Set(rows.map((r) => r.model.id))];
  const priceRows = modelIds.length
    ? await db
        .select()
        .from(marketPrices)
        .where(and(inArray(marketPrices.watchModelId, modelIds), isNull(marketPrices.watchId)))
        .orderBy(desc(marketPrices.fetchedAt))
    : [];
  const latestByModel = new Map<string, (typeof priceRows)[number]>();
  for (const p of priceRows) {
    if (!latestByModel.has(p.watchModelId)) latestByModel.set(p.watchModelId, p);
  }

  const items: WishlistItem[] = rows.map(({ item, model }) => {
    const latest = latestByModel.get(model.id) ?? null;
    return {
      id: item.id,
      watchModelId: model.id,
      targetPrice: item.targetPrice != null ? Number(item.targetPrice) : null,
      createdAt: item.createdAt.toISOString(),
      model: model as unknown as WatchModel,
      currentPrice: latest ? Number(latest.price) : null,
      currency: latest?.currency ?? 'EUR',
    };
  });

  return c.json<ApiResponse<WishlistItem[]>>({ data: items, error: null });
});

router.post('/', async (c) => {
  const userId = c.get('userId');
  const parsed = addSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  const dto = parsed.data;

  if (await alertGateFails(userId, dto.targetPrice)) {
    return c.json<ApiResponse<never>>({ data: null, error: PREMIUM_ALERT_ERROR }, 403);
  }

  let model;
  if (dto.watchModelId) {
    [model] = await db.select().from(watchModels).where(eq(watchModels.id, dto.watchModelId));
    if (!model) {
      return c.json<ApiResponse<never>>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Modèle inconnu' } },
        404
      );
    }
    // Modèle du catalogue encore sans visuel : la wishlist le mérite
    if (!model.photoUrl) enrichModelInBackground(model.id);
  } else {
    model = await findOrCreateModel(dto.brand!, dto.model!, dto.reference);
  }

  const [created] = await db
    .insert(wishlistItems)
    .values({
      userId,
      watchModelId: model.id,
      targetPrice: dto.targetPrice?.toString(),
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'ALREADY_IN_WISHLIST', message: 'Cette montre est déjà dans votre wishlist.' } },
      409
    );
  }

  const item: WishlistItem = {
    id: created.id,
    watchModelId: model.id,
    targetPrice: created.targetPrice != null ? Number(created.targetPrice) : null,
    createdAt: created.createdAt.toISOString(),
    model: model as unknown as WatchModel,
    currentPrice: null,
    currency: 'EUR',
  };
  return c.json<ApiResponse<WishlistItem>>({ data: item, error: null }, 201);
});

router.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }

  if (await alertGateFails(userId, parsed.data.targetPrice)) {
    return c.json<ApiResponse<never>>({ data: null, error: PREMIUM_ALERT_ERROR }, 403);
  }

  const [updated] = await db
    .update(wishlistItems)
    .set({
      targetPrice: parsed.data.targetPrice?.toString() ?? null,
      // Nouveau seuil = nouvelle alerte possible
      notifiedAt: null,
    })
    .where(and(eq(wishlistItems.id, id), eq(wishlistItems.userId, userId)))
    .returning();

  if (!updated) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Item introuvable' } },
      404
    );
  }
  return c.json<ApiResponse<{ id: string; targetPrice: number | null }>>({
    data: { id, targetPrice: updated.targetPrice != null ? Number(updated.targetPrice) : null },
    error: null,
  });
});

router.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [deleted] = await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.id, id), eq(wishlistItems.userId, userId)))
    .returning();

  if (!deleted) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Item introuvable' } },
      404
    );
  }
  return c.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
});

export { router as wishlistRouter };
