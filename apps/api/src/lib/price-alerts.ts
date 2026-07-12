import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  notificationPrefs,
  priceAlerts,
  pushTokens,
  watches,
  watchModels,
} from '../db/schema.js';
import { premiumUserIds, STALE_DAYS_PREMIUM } from './entitlements.js';
import { sendExpoPush } from './push.js';

// Variation minimale (en %) déclenchant une alerte — sous ce seuil c'est du
// bruit de mesure entre deux recherches, pas un mouvement de marché
export const PRICE_ALERT_THRESHOLD_PCT = 5;

const euro = (v: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(v);

// Textes en dur FR/EN : un push de fond n'a pas de contexte requête, la
// langue vient de push_tokens.locale
function alertText(
  locale: string,
  label: string,
  oldPrice: number,
  newPrice: number,
  deltaPct: number
): { title: string; body: string } {
  const up = deltaPct >= 0;
  const pct = `${up ? '+' : '−'}${Math.abs(deltaPct).toFixed(1)} %`;
  if (locale === 'en') {
    return {
      title: `${up ? '📈' : '📉'} ${label}`,
      body: `Market value moved from ${euro(oldPrice)} to ${euro(newPrice)} (${pct}).`,
    };
  }
  return {
    title: `${up ? '📈' : '📉'} ${label}`,
    body: `La cote est passée de ${euro(oldPrice)} à ${euro(newPrice)} (${pct}).`,
  };
}

/**
 * Alerte de cote (premium) : appelée par les refreshs de cote déjà déclenchés
 * — zéro appel IA, zéro cron. Anti-doublon : au plus une alerte par
 * modèle/variante par fenêtre de fraîcheur premium (7 j). Ne jette jamais :
 * une alerte qui échoue ne doit pas faire échouer le refresh.
 */
export async function maybeSendPriceAlert(args: {
  watchModelId: string;
  watchId?: string;
  previousPrice: number | null;
  newPrice: number;
}): Promise<void> {
  try {
    const { watchModelId, watchId, previousPrice, newPrice } = args;
    if (previousPrice == null || previousPrice <= 0) return;
    const deltaPct = ((newPrice - previousPrice) / previousPrice) * 100;
    if (Math.abs(deltaPct) < PRICE_ALERT_THRESHOLD_PCT) return;

    // Anti-doublon aligné sur la fréquence de refresh premium
    const windowStart = new Date(Date.now() - STALE_DAYS_PREMIUM * 24 * 3600 * 1000);
    const [recent] = await db
      .select({ id: priceAlerts.id })
      .from(priceAlerts)
      .where(
        and(
          eq(priceAlerts.watchModelId, watchModelId),
          watchId ? eq(priceAlerts.watchId, watchId) : isNull(priceAlerts.watchId),
          gte(priceAlerts.createdAt, windowStart)
        )
      )
      .limit(1);
    if (recent) return;

    // Destinataires : possesseurs du modèle (ou de la variante) ∩ premium
    // actifs − opt-out explicite
    const ownerRows = await db
      .select({ userId: watches.userId })
      .from(watches)
      .where(watchId ? eq(watches.id, watchId) : eq(watches.watchModelId, watchModelId));
    const owners = [...new Set(ownerRows.map((r) => r.userId))];
    if (!owners.length) return;

    const premium = new Set(await premiumUserIds());
    let recipients = owners.filter((u) => premium.has(u));
    if (!recipients.length) return;

    const optedOut = await db
      .select({ userId: notificationPrefs.userId })
      .from(notificationPrefs)
      .where(
        and(inArray(notificationPrefs.userId, recipients), eq(notificationPrefs.priceAlerts, false))
      );
    const optedOutIds = new Set(optedOut.map((r) => r.userId));
    recipients = recipients.filter((u) => !optedOutIds.has(u));
    if (!recipients.length) return;

    const [model] = await db
      .select()
      .from(watchModels)
      .where(eq(watchModels.id, watchModelId));
    if (!model) return;
    const label = model.nickname
      ? `${model.brand} ${model.model} « ${model.nickname} »`
      : `${model.brand} ${model.model}`;

    const tokens = await db
      .select({ token: pushTokens.token, locale: pushTokens.locale })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, recipients));
    if (!tokens.length) return;

    // Envoi par groupe de langue ; deep-link vers la fiche (variante) ou la collection
    const url = watchId ? `/watch/${watchId}` : '/(app)/collection';
    let sent = 0;
    const invalid: string[] = [];
    for (const locale of ['fr', 'en']) {
      const batch = tokens.filter((t) => (t.locale === 'en' ? 'en' : 'fr') === locale);
      if (!batch.length) continue;
      const { title, body } = alertText(locale, label, previousPrice, newPrice, deltaPct);
      const result = await sendExpoPush(batch.map((t) => t.token), title, body, { url });
      sent += result.sent;
      invalid.push(...result.invalid);
    }
    if (invalid.length) {
      await db.delete(pushTokens).where(inArray(pushTokens.token, invalid));
    }

    await db.insert(priceAlerts).values({
      watchModelId,
      watchId,
      oldPrice: previousPrice.toFixed(2),
      newPrice: newPrice.toFixed(2),
      recipients: sent,
    });
    console.log(
      `[price-alert] ${label}${watchId ? ` (variante ${watchId})` : ''}: ${deltaPct.toFixed(1)}% → ${sent} appareil(s), ${invalid.length} purgé(s)`
    );
  } catch (err) {
    console.error('[price-alert] échec (refresh non impacté):', err);
  }
}
