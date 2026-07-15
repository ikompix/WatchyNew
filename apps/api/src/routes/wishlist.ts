import { Hono } from 'hono';
import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { marketPrices, watchModels, wishlistItems } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { countWishlist, getLockedIds, getSlotLimits } from '../lib/entitlements.js';
import { refreshInBackground } from '../lib/market-research.js';
import type { ApiResponse, WatchModel, WishlistItem } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const addSchema = z
  .object({
    watchModelId: z.string().uuid().optional(),
    brand: z.string().min(1).max(80).optional(),
    model: z.string().min(1).max(120).optional(),
    reference: z.string().max(60).optional(),
    // Photo facultative uploadée par l'utilisateur (via POST /recognition)
    photoUrl: z.string().url().optional(),
  })
  .refine((v) => v.watchModelId || (v.brand && v.model), {
    message: 'watchModelId ou brand+model requis',
  });

/**
 * Saisie libre → find-or-create du modèle catalogue (croissance organique,
 * même esprit que la reconnaissance) : match par référence d'abord, sinon
 * brand+model exacts ; création avec cote lancée en fond.
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
  return created;
}

router.get('/', async (c) => {
  const userId = c.get('userId');
  const [rows, locked] = await Promise.all([
    db
      .select({ item: wishlistItems, model: watchModels })
      .from(wishlistItems)
      .innerJoin(watchModels, eq(wishlistItems.watchModelId, watchModels.id))
      .where(eq(wishlistItems.userId, userId))
      .orderBy(desc(wishlistItems.createdAt)),
    getLockedIds(userId),
  ]);

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
      photoUrl: item.photoUrl,
      createdAt: item.createdAt.toISOString(),
      model: model as unknown as WatchModel,
      currentPrice: latest ? Number(latest.price) : null,
      currency: latest?.currency ?? 'EUR',
      locked: locked.wishlistIds.has(item.id),
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

  let model;
  if (dto.watchModelId) {
    [model] = await db.select().from(watchModels).where(eq(watchModels.id, dto.watchModelId));
    if (!model) {
      return c.json<ApiResponse<never>>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Modèle inconnu' } },
        404
      );
    }
  } else {
    model = await findOrCreateModel(dto.brand!, dto.model!, dto.reference);
  }

  // Doublon avant quota : re-ajouter un item existant ne consomme aucun emplacement
  const [existing] = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.watchModelId, model.id)))
    .limit(1);
  if (existing) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'ALREADY_IN_WISHLIST', message: 'Cette montre est déjà dans votre wishlist.' } },
      409
    );
  }

  // Quota free du pool wishlist : 3 gratuits + emplacements achetés à l'unité
  const { wishlist: slotLimit } = await getSlotLimits(userId);
  if (slotLimit != null && (await countWishlist(userId)) >= slotLimit) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Limite de ${slotLimit} montres en wishlist atteinte — passez à Premium pour l'illimité, ou ajoutez un emplacement.`,
        },
      },
      403
    );
  }

  const [created] = await db
    .insert(wishlistItems)
    .values({ userId, watchModelId: model.id, photoUrl: dto.photoUrl })
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
    photoUrl: created.photoUrl,
    createdAt: created.createdAt.toISOString(),
    model: model as unknown as WatchModel,
    currentPrice: null,
    currency: 'EUR',
  };
  return c.json<ApiResponse<WishlistItem>>({ data: item, error: null }, 201);
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
