import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { expertReports, watches } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { countWatches, FREE_WATCH_LIMIT, getPlan } from '../lib/entitlements.js';
import { generateReportInBackground, reportGenerating } from '../lib/expert-report.js';
import { marketResearchAvailable } from '../lib/market-research.js';
import { computeCompletionPct } from '@watchy/types';
import type { CreateWatchDto, UpdateWatchDto, ApiResponse } from '@watchy/types';
import type { ExpertReport, ExpertReportStatus, Watch } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const createWatchSchema = z.object({
  watchModelId: z.string().uuid().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  reference: z.string().optional(),
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

router.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(watches).where(eq(watches.userId, userId));
  return c.json<ApiResponse<Watch[]>>({ data: rows as unknown as Watch[], error: null });
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

  // Plan free : 5 montres max. Grandfathering doux — l'existant au-delà
  // de la limite n'est jamais supprimé, seul l'ajout est bloqué.
  if ((await getPlan(userId)) === 'free' && (await countWatches(userId)) >= FREE_WATCH_LIMIT) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Limite de ${FREE_WATCH_LIMIT} montres atteinte — passez à Premium pour une collection illimitée.`,
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
  return c.json<ApiResponse<Watch>>({ data: row as unknown as Watch, error: null });
});

router.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<UpdateWatchDto>();
  const parsed = createWatchSchema.partial().safeParse(body);

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

  const dto = parsed.data;
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
      purchasePrice: dto.purchasePrice?.toString(),
      completionPct,
      updatedAt: new Date(),
    })
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .returning();

  return c.json<ApiResponse<Watch>>({ data: updated as unknown as Watch, error: null });
});

// --- Rapport d'expert IA (premium) ---------------------------------------

type ReportContext =
  | { ok: true; watch: typeof watches.$inferSelect; report: typeof expertReports.$inferSelect | null }
  | { ok: false; status: 403 | 404; code: string; message: string };

async function loadReportContext(userId: string, watchId: string): Promise<ReportContext> {
  if ((await getPlan(userId)) !== 'premium') {
    return {
      ok: false,
      status: 403,
      code: 'PREMIUM_REQUIRED',
      message: "Le rapport d'expert est réservé aux membres Premium.",
    };
  }
  const [watch] = await db
    .select()
    .from(watches)
    .where(and(eq(watches.id, watchId), eq(watches.userId, userId)));
  if (!watch) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Watch not found' };
  }
  const [report] = await db.select().from(expertReports).where(eq(expertReports.watchId, watchId));
  return { ok: true, watch, report: report ?? null };
}

function toStatus(ctx: Extract<ReportContext, { ok: true }>): ExpertReportStatus {
  const { watch, report } = ctx;
  return {
    report: report
      ? ({
          watchId: report.watchId,
          content: report.content,
          model: report.model,
          createdAt: report.createdAt.toISOString(),
        } satisfies ExpertReport)
      : null,
    generating: reportGenerating(watch.id),
    // La montre a changé (variante, état…) après la génération → à rafraîchir
    stale: report != null && watch.updatedAt > report.createdAt,
  };
}

router.get('/:id/expert-report', async (c) => {
  const ctx = await loadReportContext(c.get('userId'), c.req.param('id'));
  if (!ctx.ok) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: ctx.code, message: ctx.message } },
      ctx.status
    );
  }
  return c.json<ApiResponse<ExpertReportStatus>>({ data: toStatus(ctx), error: null });
});

router.post('/:id/expert-report', async (c) => {
  const ctx = await loadReportContext(c.get('userId'), c.req.param('id'));
  if (!ctx.ok) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: ctx.code, message: ctx.message } },
      ctx.status
    );
  }

  const current = toStatus(ctx);
  // Rapport à jour : rien à générer
  if (current.report && !current.stale) {
    return c.json<ApiResponse<ExpertReportStatus>>({ data: current, error: null });
  }
  if (!marketResearchAvailable()) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: { code: 'AI_UNAVAILABLE', message: "La génération de rapports est momentanément indisponible." },
      },
      503
    );
  }

  generateReportInBackground(ctx.watch.id);
  return c.json<ApiResponse<ExpertReportStatus>>(
    { data: { ...current, generating: true }, error: null },
    202
  );
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
