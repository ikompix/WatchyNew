import { Hono } from 'hono';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketPrices, watches } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { getPlan } from '../lib/entitlements.js';
import type {
  ApiResponse,
  PortfolioPoint,
  PortfolioSummary,
  PortfolioWatchValuation,
} from '@watchy/types';
import type { MarketPriceSelect, WatchSelect } from '../db/schema.js';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const MAX_HISTORY_POINTS = 60;

/** Même règle que market-prices : full set si papiers + boîte et cote full set connue. */
function valueOf(watch: WatchSelect, row: MarketPriceSelect): number {
  return watch.hasPapers && watch.hasBox && row.fullSetPrice != null
    ? Number(row.fullSetPrice)
    : Number(row.price);
}

router.get('/', async (c) => {
  const userId = c.get('userId');

  if ((await getPlan(userId)) !== 'premium') {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'PREMIUM_REQUIRED',
          message: 'Le tableau de bord patrimonial est réservé aux membres Premium.',
        },
      },
      403
    );
  }

  const userWatches = await db.select().from(watches).where(eq(watches.userId, userId));

  const empty: PortfolioSummary = {
    totalValue: null,
    totalPurchase: null,
    totalGain: null,
    valuedWatches: 0,
    totalWatches: userWatches.length,
    currency: 'EUR',
    history: [],
    watches: [],
  };
  if (userWatches.length === 0) {
    return c.json<ApiResponse<PortfolioSummary>>({ data: empty, error: null });
  }

  const watchIds = userWatches.map((w) => w.id);
  const modelIds = [
    ...new Set(userWatches.map((w) => w.watchModelId).filter((id): id is string => id != null)),
  ];

  // Deux requêtes pour toute la collection (pas de N+1) : cotes de variante
  // (watch_id) et cotes de base des modèles concernés.
  const variantRows = await db
    .select()
    .from(marketPrices)
    .where(inArray(marketPrices.watchId, watchIds))
    .orderBy(asc(marketPrices.fetchedAt));
  const baseRows = modelIds.length
    ? await db
        .select()
        .from(marketPrices)
        .where(and(inArray(marketPrices.watchModelId, modelIds), isNull(marketPrices.watchId)))
        .orderBy(asc(marketPrices.fetchedAt))
    : [];

  const byWatch = new Map<string, MarketPriceSelect[]>();
  for (const row of variantRows) {
    if (!row.watchId) continue;
    (byWatch.get(row.watchId) ?? byWatch.set(row.watchId, []).get(row.watchId)!).push(row);
  }
  const byModel = new Map<string, MarketPriceSelect[]>();
  for (const row of baseRows) {
    (byModel.get(row.watchModelId) ?? byModel.set(row.watchModelId, []).get(row.watchModelId)!).push(row);
  }

  // La variante prime sur la cote de base — même règle que GET /market-prices/watch/:id
  const seriesFor = (watch: WatchSelect): MarketPriceSelect[] => {
    const variant = byWatch.get(watch.id);
    if (variant?.length) return variant;
    return watch.watchModelId ? (byModel.get(watch.watchModelId) ?? []) : [];
  };

  let totalValue = 0;
  let totalPurchase = 0;
  let totalGain = 0;
  let valuedWatches = 0;
  let hasPurchase = false;
  let hasGain = false;

  const valuations: PortfolioWatchValuation[] = userWatches.map((watch) => {
    const rows = seriesFor(watch);
    const latest = rows.at(-1) ?? null;
    const currentValue = latest ? valueOf(watch, latest) : null;
    const purchasePrice = watch.purchasePrice != null ? Number(watch.purchasePrice) : null;
    // La plus-value ne compare que ce qui est comparable (cote ET prix d'achat connus)
    const gain = currentValue != null && purchasePrice != null ? currentValue - purchasePrice : null;

    if (currentValue != null) {
      totalValue += currentValue;
      valuedWatches += 1;
    }
    if (purchasePrice != null) {
      totalPurchase += purchasePrice;
      hasPurchase = true;
    }
    if (gain != null) {
      totalGain += gain;
      hasGain = true;
    }
    return { watchId: watch.id, currentValue, purchasePrice, gain };
  });

  // Série temporelle : valeur de la collection à chaque date de cote,
  // en reportant la dernière cote connue de chaque montre (carry-forward).
  const events: { t: number; key: string; value: number }[] = [];
  for (const watch of userWatches) {
    for (const row of seriesFor(watch)) {
      events.push({ t: row.fetchedAt.getTime(), key: watch.id, value: valueOf(watch, row) });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const lastKnown = new Map<string, number>();
  let history: PortfolioPoint[] = [];
  for (let i = 0; i < events.length; i++) {
    lastKnown.set(events[i].key, events[i].value);
    // N'émettre qu'un point par timestamp distinct
    if (i + 1 < events.length && events[i + 1].t === events[i].t) continue;
    let sum = 0;
    for (const v of lastKnown.values()) sum += v;
    history.push({ date: new Date(events[i].t).toISOString(), value: Math.round(sum) });
  }
  if (history.length > MAX_HISTORY_POINTS) {
    const stride = Math.ceil(history.length / MAX_HISTORY_POINTS);
    const sampled = history.filter((_, i) => i % stride === 0);
    if (sampled.at(-1) !== history.at(-1)) sampled.push(history.at(-1)!);
    history = sampled;
  }

  const currency = variantRows[0]?.currency ?? baseRows[0]?.currency ?? 'EUR';

  return c.json<ApiResponse<PortfolioSummary>>({
    data: {
      totalValue: valuedWatches > 0 ? Math.round(totalValue) : null,
      totalPurchase: hasPurchase ? Math.round(totalPurchase) : null,
      totalGain: hasGain ? Math.round(totalGain) : null,
      valuedWatches,
      totalWatches: userWatches.length,
      currency,
      history,
      watches: valuations,
    },
    error: null,
  });
});

export { router as portfolioRouter };
