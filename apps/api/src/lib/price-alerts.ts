import { and, desc, eq, gt, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketPrices, pushTokens, watchModels, wishlistItems } from '../db/schema.js';
import { getPlan, STALE_DAYS_PREMIUM } from './entitlements.js';
import { marketResearchAvailable, refreshModelPrice } from './market-research.js';
import { sendExpoPush } from './push.js';

// Les alertes sont une feature premium → fenêtre de fraîcheur premium
const STALE_DAYS = STALE_DAYS_PREMIUM;
// Plafond de recherches IA par passage — maîtrise du coût
const MAX_REFRESH_PER_RUN = 5;

const euro = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

/**
 * Alertes de prix wishlist (premium) : rafraîchit au besoin la cote des
 * modèles suivis, puis notifie chaque item dont la cote est passée sous le
 * prix cible et pas encore signalée pour cette cote.
 * dryRun : tout sauf l'envoi réseau (les notifiedAt sont posés) — pour les tests.
 */
export async function checkPriceAlerts(options: { dryRun?: boolean } = {}): Promise<number> {
  const items = await db
    .select({ item: wishlistItems, model: watchModels })
    .from(wishlistItems)
    .innerJoin(watchModels, eq(wishlistItems.watchModelId, watchModels.id))
    .where(isNotNull(wishlistItems.targetPrice));
  if (items.length === 0) return 0;

  // L'alerte est une feature premium : on filtre par propriétaire
  const planByUser = new Map<string, string>();
  for (const userId of new Set(items.map((r) => r.item.userId))) {
    planByUser.set(userId, await getPlan(userId));
  }
  const active = items.filter((r) => planByUser.get(r.item.userId) === 'premium');
  if (active.length === 0) return 0;

  // Cotes trop vieilles → recherche IA, plafonnée par passage
  if (marketResearchAvailable()) {
    const staleSince = new Date(Date.now() - STALE_DAYS * 24 * 3600 * 1000);
    let refreshed = 0;
    for (const modelId of new Set(active.map((r) => r.model.id))) {
      if (refreshed >= MAX_REFRESH_PER_RUN) break;
      const [fresh] = await db
        .select({ id: marketPrices.id })
        .from(marketPrices)
        .where(
          and(
            eq(marketPrices.watchModelId, modelId),
            isNull(marketPrices.watchId),
            ne(marketPrices.source, 'seed'),
            gt(marketPrices.fetchedAt, staleSince)
          )
        )
        .limit(1);
      if (!fresh) {
        await refreshModelPrice(modelId).catch((err) => console.error(`[alerts] refresh ${modelId}:`, err));
        refreshed++;
      }
    }
  }

  // Dernière cote de base par modèle suivi
  const modelIds = [...new Set(active.map((r) => r.model.id))];
  const priceRows = await db
    .select()
    .from(marketPrices)
    .where(and(inArray(marketPrices.watchModelId, modelIds), isNull(marketPrices.watchId)))
    .orderBy(desc(marketPrices.fetchedAt));
  const latestByModel = new Map<string, (typeof priceRows)[number]>();
  for (const p of priceRows) {
    if (!latestByModel.has(p.watchModelId)) latestByModel.set(p.watchModelId, p);
  }

  let sent = 0;
  for (const { item, model } of active) {
    const latest = latestByModel.get(model.id);
    if (!latest) continue;
    const price = Number(latest.price);
    const target = Number(item.targetPrice);
    const alreadyNotified = item.notifiedAt != null && item.notifiedAt >= latest.fetchedAt;
    if (price > target || alreadyNotified) continue;

    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, item.userId));
    const title = '🎯 Prix cible atteint';
    const body = `${model.canonicalName} est passée sous ${euro(target)} : cote actuelle ${euro(price)}.`;

    if (options.dryRun) {
      console.log(`[alerts] (dry-run) ${item.userId} ← ${body} [${tokens.length} appareil(s)]`);
    } else if (tokens.length > 0) {
      await sendExpoPush(tokens.map((t) => t.token), title, body, { watchModelId: model.id });
      console.log(`[alerts] notifié ${item.userId}: ${model.canonicalName} à ${euro(price)}`);
    }

    await db
      .update(wishlistItems)
      .set({ notifiedAt: new Date() })
      .where(eq(wishlistItems.id, item.id));
    sent++;
  }
  return sent;
}
