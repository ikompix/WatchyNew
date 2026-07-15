import { Hono } from 'hono';
import { eq, and, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { watches, watchDocuments } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { countWatches, getLockedIds, getPlan, getSlotLimits } from '../lib/entitlements.js';
import { nicknameForReference } from '../lib/nickname-map.js';
import {
  deleteDocuments,
  signDocumentUrl,
  sniffImageMime,
  uploadWatchDocument,
} from '../lib/storage.js';
import { computeCompletionPct } from '@watchy/types';
import type {
  CreateWatchDto,
  UpdateWatchDto,
  ApiResponse,
  Watch,
  WatchDocument,
} from '@watchy/types';

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

  // Plan free : 3 emplacements de collection, plus ceux achetés à l'unité.
  // L'existant au-delà de la limite n'est jamais supprimé — il est verrouillé
  // en lecture (voir getLockedIds), la suppression restant possible pour
  // libérer un slot.
  const { collection: slotLimit } = await getSlotLimits(userId);
  if (slotLimit != null && (await countWatches(userId)) >= slotLimit) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Limite de ${slotLimit} montres en collection atteinte — passez à Premium pour l'illimité, ou ajoutez un emplacement.`,
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
  // Les lignes watch_documents partent en cascade FK, pas les fichiers du
  // bucket — récupérer les chemins avant le delete
  const docs = await db
    .select({ path: watchDocuments.path })
    .from(watchDocuments)
    .where(and(eq(watchDocuments.watchId, id), eq(watchDocuments.userId, userId)));
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
  await deleteDocuments(docs.map((d) => d.path));
  return c.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
});

// ── Coffre-fort documents (premium) ─────────────────────────────────────────

const MAX_DOCS_PER_WATCH = 10;

const addDocumentSchema = z.object({
  // ~8 Mo binaire une fois le base64 décodé
  imageBase64: z.string().min(1).max(11_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  label: z.string().trim().min(1).max(120).optional(),
});

/**
 * Gate commun : la montre doit appartenir au user (404 sinon) et le compte
 * être premium (403 PREMIUM_REQUIRED sinon — les documents d'un compte
 * repassé free sont gardés mais gatés, comme getLockedIds).
 */
async function documentsGate(userId: string, watchId: string): Promise<
  { ok: true } | { ok: false; status: 403 | 404; code: string; message: string }
> {
  const [row] = await db
    .select({ id: watches.id })
    .from(watches)
    .where(and(eq(watches.id, watchId), eq(watches.userId, userId)));
  if (!row) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Watch not found' };
  }
  if ((await getPlan(userId)) !== 'premium') {
    return {
      ok: false,
      status: 403,
      code: 'PREMIUM_REQUIRED',
      message: 'Le coffre-fort documents est réservé aux membres Premium.',
    };
  }
  return { ok: true };
}

router.get('/:id/documents', async (c) => {
  const userId = c.get('userId');
  const watchId = c.req.param('id');
  const gate = await documentsGate(userId, watchId);
  if (!gate.ok) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: gate.code, message: gate.message } },
      gate.status
    );
  }

  const rows = await db
    .select()
    .from(watchDocuments)
    .where(and(eq(watchDocuments.watchId, watchId), eq(watchDocuments.userId, userId)));
  const data = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      label: r.label,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
      url: await signDocumentUrl(r.path),
    }))
  );
  return c.json<ApiResponse<WatchDocument[]>>({ data, error: null });
});

router.post('/:id/documents', async (c) => {
  const userId = c.get('userId');
  const watchId = c.req.param('id');
  const parsed = addDocumentSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }
  const gate = await documentsGate(userId, watchId);
  if (!gate.ok) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: gate.code, message: gate.message } },
      gate.status
    );
  }

  const [{ value: docCount }] = await db
    .select({ value: count() })
    .from(watchDocuments)
    .where(eq(watchDocuments.watchId, watchId));
  if (docCount >= MAX_DOCS_PER_WATCH) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Limite de ${MAX_DOCS_PER_WATCH} documents par montre atteinte.`,
        },
      },
      403
    );
  }

  const buffer = Buffer.from(parsed.data.imageBase64, 'base64');
  const mime = sniffImageMime(buffer) ?? parsed.data.mimeType;
  const { path, sizeBytes } = await uploadWatchDocument(userId, parsed.data.imageBase64, mime);
  const [created] = await db
    .insert(watchDocuments)
    .values({ userId, watchId, path, mimeType: mime, sizeBytes, label: parsed.data.label })
    .returning();

  return c.json<ApiResponse<WatchDocument>>(
    {
      data: {
        id: created.id,
        label: created.label,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        createdAt: created.createdAt.toISOString(),
        url: await signDocumentUrl(created.path),
      },
      error: null,
    },
    201
  );
});

router.delete('/:id/documents/:docId', async (c) => {
  const userId = c.get('userId');
  const watchId = c.req.param('id');
  const docId = c.req.param('docId');
  const gate = await documentsGate(userId, watchId);
  if (!gate.ok) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: gate.code, message: gate.message } },
      gate.status
    );
  }

  const [deleted] = await db
    .delete(watchDocuments)
    .where(
      and(
        eq(watchDocuments.id, docId),
        eq(watchDocuments.watchId, watchId),
        eq(watchDocuments.userId, userId)
      )
    )
    .returning();
  if (!deleted) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Document not found' } },
      404
    );
  }
  await deleteDocuments([deleted.path]);
  return c.json<ApiResponse<{ id: string }>>({ data: { id: docId }, error: null });
});

export { router as watchesRouter };
