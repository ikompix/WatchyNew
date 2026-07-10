import { Hono } from 'hono';
import { eq, desc, and, ne, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketPrices, watches } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { getLockedIds, getPlan, STALE_DAYS_FREE, STALE_DAYS_PREMIUM } from '../lib/entitlements.js';
import {
  marketResearchAvailable,
  refreshInBackground,
  refreshWatchInBackground,
} from '../lib/market-research.js';
import type { ApiResponse, MarketPrice } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const staleSince = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Fenêtre de fraîcheur monétisée : hebdo en premium, mensuelle en free. */
async function staleDaysFor(userId: string): Promise<number> {
  return (await getPlan(userId)) === 'premium' ? STALE_DAYS_PREMIUM : STALE_DAYS_FREE;
}

async function modelNeedsRefresh(watchModelId: string, days: number): Promise<boolean> {
  const [fresh] = await db
    .select({ id: marketPrices.id })
    .from(marketPrices)
    .where(
      and(
        eq(marketPrices.watchModelId, watchModelId),
        isNull(marketPrices.watchId),
        ne(marketPrices.source, 'seed'),
        gt(marketPrices.fetchedAt, staleSince(days))
      )
    )
    .limit(1);
  return !fresh;
}

/**
 * Cote de la variante d'une montre : lignes watch_id si présentes, sinon
 * cote de base du modèle. Rafraîchit en tâche de fond si la cote est vieille
 * ou si les attributs de la montre ont changé depuis.
 */
router.get('/watch/:watchId', async (c) => {
  const userId = c.get('userId');
  const watchId = c.req.param('watchId');

  const [watch] = await db
    .select()
    .from(watches)
    .where(and(eq(watches.id, watchId), eq(watches.userId, userId)));
  if (!watch) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'NOT_FOUND', message: 'Watch not found' } },
      404
    );
  }
  if ((await getLockedIds(userId)).watchIds.has(watchId)) {
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

  const variantRows = await db
    .select()
    .from(marketPrices)
    .where(eq(marketPrices.watchId, watchId))
    .orderBy(desc(marketPrices.fetchedAt))
    .limit(30);

  let rows = variantRows;
  if (rows.length === 0 && watch.watchModelId) {
    rows = await db
      .select()
      .from(marketPrices)
      .where(and(eq(marketPrices.watchModelId, watch.watchModelId), isNull(marketPrices.watchId)))
      .orderBy(desc(marketPrices.fetchedAt))
      .limit(30);
  }

  if (marketResearchAvailable() && watch.watchModelId) {
    const days = await staleDaysFor(userId);
    const hasVariantAttrs = Boolean(watch.dialColor || watch.productionYear || watch.condition);
    if (hasVariantAttrs) {
      const latestVariant = variantRows[0] ?? null;
      const stale =
        !latestVariant ||
        latestVariant.fetchedAt < staleSince(days) ||
        // Attributs modifiés après la dernière cote → la variante a changé
        watch.updatedAt > latestVariant.fetchedAt;
      if (stale) refreshWatchInBackground(watchId);
    } else if (await modelNeedsRefresh(watch.watchModelId, days)) {
      refreshInBackground(watch.watchModelId);
    }
  }

  return c.json<ApiResponse<MarketPrice[]>>({
    data: rows as unknown as MarketPrice[],
    error: null,
  });
});

/** Cote de base d'un modèle du catalogue (collection, estimation de la sheet). */
router.get('/:watchModelId', async (c) => {
  const userId = c.get('userId');
  const watchModelId = c.req.param('watchModelId');
  const rows = await db
    .select()
    .from(marketPrices)
    .where(and(eq(marketPrices.watchModelId, watchModelId), isNull(marketPrices.watchId)))
    .orderBy(desc(marketPrices.fetchedAt))
    .limit(30);

  if (
    marketResearchAvailable() &&
    (await modelNeedsRefresh(watchModelId, await staleDaysFor(userId)))
  ) {
    refreshInBackground(watchModelId);
  }

  return c.json<ApiResponse<MarketPrice[]>>({
    data: rows as unknown as MarketPrice[],
    error: null,
  });
});

export { router as marketPricesRouter };
