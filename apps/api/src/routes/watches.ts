import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { watches } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { countSlots, FREE_SLOT_LIMIT, getLockedIds, getPlan } from '../lib/entitlements.js';
import { nicknameForReference } from '../lib/nickname-map.js';
import { computeCompletionPct } from '@watchy/types';
import type { CreateWatchDto, UpdateWatchDto, ApiResponse, Watch } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const createWatchSchema = z.object({
  watchModelId: z.string().uuid().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  reference: z.string().optional(),
  nickname: z.string().min(1).max(80).optional(),
  photoUrl: z.string().url().optional(),
  dialColor: z.string().min(1).max(80).optional(),
  productionYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  condition: z.enum(['neuf', 'tres_bon', 'bon', 'use']).optional(),
  purchasePrice: z.number().positive().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasPapers: z.boolean().optional(),
  hasBox: z.boolean().optional(),
  notes: z.string().optional(),
});

// PATCH : champ absent = inchangé, null = effacé (formulaire d'édition « tout d'un coup »)
const updateWatchSchema = createWatchSchema.partial().extend({
  reference: z.string().nullish(),
  nickname: z.string().min(1).max(80).nullish(),
  dialColor: z.string().min(1).max(80).nullish(),
  productionYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .nullish(),
  condition: z.enum(['neuf', 'tres_bon', 'bon', 'use']).nullish(),
  purchasePrice: z.number().positive().nullish(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notes: z.string().nullish(),
});

router.get('/', async (c) => {
  const userId = c.get('userId');
  const [rows, locked] = await Promise.all([
    db.select().from(watches).where(eq(watches.userId, userId)),
    getLockedIds(userId),
  ]);
  const data = rows.map((r) => ({ ...r, locked: locked.watchIds.has(r.id) }));
  return c.json<ApiResponse<Watch[]>>({ data: data as unknown as Watch[], error: null });
});

router.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<CreateWatchDto>();
  const parsed = createWatchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }

  // Plan free : 5 emplacements EN TOUT (collection + wishlist). L'existant
  // au-delà de la limite n'est jamais supprimé — il est verrouillé en lecture
  // (voir getLockedIds), la suppression restant possible pour libérer un slot.
  if ((await getPlan(userId)) === 'free' && (await countSlots(userId)) >= FREE_SLOT_LIMIT) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Limite de ${FREE_SLOT_LIMIT} montres atteinte (collection + wishlist) — passez à Premium pour l'illimité.`,
        },
      },
      403
    );
  }

  const dto = parsed.data;
  const completionPct = computeCompletionPct({
    photoUrl: dto.photoUrl ?? null,
    reference: dto.reference ?? null,
    dialColor: dto.dialColor ?? null,
    productionYear: dto.productionYear ?? null,
    condition: dto.condition ?? null,
    purchasePrice: dto.purchasePrice ?? null,
    purchaseDate: dto.purchaseDate ?? null,
    hasPapers: dto.hasPapers ?? false,
    hasBox: dto.hasBox ?? false,
  });

  const [created] = await db
    .insert(watches)
    .values({
      userId,
      watchModelId: dto.watchModelId,
      brand: dto.brand,
      model: dto.model,
      reference: dto.reference,
      // Surnom fourni (reco IA), sinon déduit de la référence (saisie manuelle)
      nickname: dto.nickname ?? nicknameForReference(dto.reference),
      photoUrl: dto.photoUrl,
      dialColor: dto.dialColor,
      productionYear: dto.productionYear,
      condition: dto.condition,
      purchasePrice: dto.purchasePrice?.toString(),
      purchaseDate: dto.purchaseDate,
      hasPapers: dto.hasPapers ?? false,
      hasBox: dto.hasBox ?? false,
      notes: dto.notes,
      completionPct,
    })
    .returning();

  return c.json<ApiResponse<Watch>>({ data: created as unknown as Watch, error: null }, 201);
});

router.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)));

  if (!row) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Watch not found' } },
      404
    );
  }
  if ((await getLockedIds(userId)).watchIds.has(id)) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'PREMIUM_REQUIRED',
          message: 'Cette montre est verrouillée — repassez à Premium pour y accéder.',
        },
      },
      403
    );
  }
  return c.json<ApiResponse<Watch>>({ data: row as unknown as Watch, error: null });
});

router.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<UpdateWatchDto>();
  const parsed = updateWatchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }

  const [existing] = await db
    .select()
    .from(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)));

  if (!existing) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Watch not found' } },
      404
    );
  }
  if ((await getLockedIds(userId)).watchIds.has(id)) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'PREMIUM_REQUIRED',
          message: 'Cette montre est verrouillée — repassez à Premium pour y accéder.',
        },
      },
      403
    );
  }

  const dto = parsed.data;
  // Référence modifiée sans surnom saisi : l'ancien surnom désignait
  // l'ancienne référence — recalculé depuis le mapping (possiblement null)
  if (dto.nickname == null && dto.reference !== undefined) {
    const norm = (r: string | null | undefined) => r?.trim().toLowerCase() ?? null;
    if (norm(dto.reference) !== norm(existing.reference)) {
      dto.nickname = nicknameForReference(dto.reference);
    }
  }
  const merged = { ...existing, ...dto };
  const completionPct = computeCompletionPct({
    photoUrl: merged.photoUrl ?? null,
    reference: merged.reference ?? null,
    dialColor: merged.dialColor ?? null,
    productionYear: merged.productionYear ?? null,
    condition: (merged.condition as 'neuf' | 'tres_bon' | 'bon' | 'use' | null) ?? null,
    purchasePrice: merged.purchasePrice != null ? Number(merged.purchasePrice) : null,
    purchaseDate: merged.purchaseDate ?? null,
    hasPapers: merged.hasPapers,
    hasBox: merged.hasBox,
  });

  const [updated] = await db
    .update(watches)
    .set({
      ...dto,
      purchasePrice:
        dto.purchasePrice === undefined
          ? undefined
          : dto.purchasePrice === null
            ? null
            : dto.purchasePrice.toString(),
      completionPct,
      updatedAt: new Date(),
    })
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .returning();

  return c.json<ApiResponse<Watch>>({ data: updated as unknown as Watch, error: null });
});

router.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [deleted] = await db
    .delete(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .returning();

  if (!deleted) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Watch not found' } },
      404
    );
  }
  return c.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
});

export { router as watchesRouter };
