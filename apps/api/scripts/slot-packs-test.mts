// Smoke test monétisation — packs +1 emplacement (collection / wishlist),
// coffre-fort documents et alertes de cote. Crée un user jetable, joue les
// webhooks RevenueCat consommables (avec rejeu pour l'idempotence), puis
// nettoie. Remplace release-1-2-test.mts (les crédits de scan ont disparu).
// Prérequis : API lancée sur :3000 avec le même .env (REVENUECAT_WEBHOOK_SECRET
// inclus) et bucket privé watch-documents créé.
//   npx tsx --env-file=.env scripts/slot-packs-test.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import {
  consumablePurchases,
  entitlements,
  marketPrices,
  notificationPrefs,
  priceAlerts,
  pushTokens,
  recognitionEvents,
  watchDocuments,
  watches,
  watchModels,
  wishlistItems,
} from '../src/db/schema.js';
import { maybeSendPriceAlert } from '../src/lib/price-alerts.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

// Doivent suivre src/lib/entitlements.ts
const FREE_WATCH_SLOTS = 3;
const FREE_WISHLIST_SLOTS = 3;

let failures = 0;
function expect(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

// ⚠️ Toujours fournir un `id` distinct par achat : la clé de repli du webhook
// (type:user:produit) collisionne pour deux achats du même produit.
async function rcEvent(event: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ event }),
  });
  return res.status;
}

const email = `slot-packs-test-${Date.now()}@watchy.test`;
const password = 'slot-packs-test-Passw0rd!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;
let modelId: string | null = null;

try {
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  const headers = {
    Authorization: `Bearer ${session.session!.access_token}`,
    'Content-Type': 'application/json',
  };
  const me = async () => (await (await fetch(`${API}/me`, { headers })).json()).data;
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // ── 1. Pack +1 slot collection : achat, idempotence, refund ─────────────
  for (let i = 1; i <= FREE_WATCH_SLOTS; i++) {
    await fetch(`${API}/watches`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${i}` }),
    });
  }
  let res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${FREE_WATCH_SLOTS + 1}` }),
  });
  let body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `${FREE_WATCH_SLOTS + 1}ᵉ montre sans pack → 403 QUOTA_EXCEEDED (reçu ${res.status})`);

  let status = await rcEvent({
    id: 'evt-wslot-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_watch_slot_1',
  });
  let m = await me();
  expect(status === 200 && m.watchSlotsLimit === FREE_WATCH_SLOTS + 1,
    `webhook watchy_watch_slot_1 → limite collection ${FREE_WATCH_SLOTS + 1} (reçu ${m.watchSlotsLimit})`);
  expect(m.wishlistSlotsLimit === FREE_WISHLIST_SLOTS,
    `le pack collection n'augmente PAS la wishlist (reçu ${m.wishlistSlotsLimit})`);

  status = await rcEvent({
    id: 'evt-wslot-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_watch_slot_1',
  });
  m = await me();
  expect(status === 200 && m.watchSlotsLimit === FREE_WATCH_SLOTS + 1,
    `rejeu du même event.id → toujours ${FREE_WATCH_SLOTS + 1}, idempotent (reçu ${m.watchSlotsLimit})`);

  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${FREE_WATCH_SLOTS + 1}` }),
  });
  expect(res.status === 201, `${FREE_WATCH_SLOTS + 1}ᵉ montre avec pack → 201 (reçu ${res.status})`);
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${FREE_WATCH_SLOTS + 2}` }),
  });
  expect(res.status === 403,
    `${FREE_WATCH_SLOTS + 2}ᵉ montre → 403, la limite ${FREE_WATCH_SLOTS + 1} tient (reçu ${res.status})`);

  // Refund → limite retombe à 3, la montre la plus récente se verrouille
  status = await rcEvent({
    id: 'evt-wslot-refund', type: 'CANCELLATION', app_user_id: userId, product_id: 'watchy_watch_slot_1',
  });
  m = await me();
  expect(status === 200 && m.watchSlotsLimit === FREE_WATCH_SLOTS,
    `refund watchy_watch_slot_1 → limite ${FREE_WATCH_SLOTS} (reçu ${m.watchSlotsLimit})`);
  body = await (await fetch(`${API}/watches`, { headers })).json();
  const lockedCount = body.data.filter((w: { locked?: boolean }) => w.locked).length;
  expect(lockedCount === 1,
    `après refund : 1 montre verrouillée (la plus récente) (reçu ${lockedCount})`);

  // ── 2. Pack +1 slot wishlist : pools indépendants ────────────────────────
  for (let i = 1; i <= FREE_WISHLIST_SLOTS; i++) {
    await fetch(`${API}/wishlist`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Wishlist ${i}` }),
    });
  }
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: `Wishlist ${FREE_WISHLIST_SLOTS + 1}` }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `${FREE_WISHLIST_SLOTS + 1}ᵉ item wishlist sans pack → 403 (reçu ${res.status})`);

  status = await rcEvent({
    id: 'evt-wlslot-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_wishlist_slot_1',
  });
  m = await me();
  expect(status === 200 && m.wishlistSlotsLimit === FREE_WISHLIST_SLOTS + 1,
    `webhook watchy_wishlist_slot_1 → limite wishlist ${FREE_WISHLIST_SLOTS + 1} (reçu ${m.wishlistSlotsLimit})`);
  expect(m.watchSlotsLimit === FREE_WATCH_SLOTS,
    `le pack wishlist n'augmente PAS la collection (reçu ${m.watchSlotsLimit})`);

  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: `Wishlist ${FREE_WISHLIST_SLOTS + 1}` }),
  });
  expect(res.status === 201,
    `${FREE_WISHLIST_SLOTS + 1}ᵉ item wishlist avec pack → 201 (reçu ${res.status})`);

  // ── 3. Coffre-fort documents ─────────────────────────────────────────────
  const watchesRes = await (await fetch(`${API}/watches`, { headers })).json();
  const watchId = watchesRes.data.find((w: { locked?: boolean }) => !w.locked).id as string;

  res = await fetch(`${API}/watches/${watchId}/documents`, { headers });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'PREMIUM_REQUIRED',
    `documents en free → 403 PREMIUM_REQUIRED (reçu ${res.status} ${body.error?.code})`);

  await rcEvent({
    type: 'INITIAL_PURCHASE', app_user_id: userId,
    expiration_at_ms: Date.now() + 30 * 24 * 3600 * 1000,
  });
  res = await fetch(`${API}/watches/${watchId}/documents`, {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64: png1x1, mimeType: 'image/png', label: 'Facture' }),
  });
  body = await res.json();
  const docId = body.data?.id;
  expect(res.status === 201 && typeof body.data?.url === 'string',
    `POST document en premium → 201 avec URL signée (reçu ${res.status})`);

  if (body.data?.url) {
    const signed = await fetch(body.data.url);
    expect(signed.status === 200, `l'URL signée répond → 200 (reçu ${signed.status})`);
  }

  res = await fetch(`${API}/watches/${watchId}/documents`, { headers });
  body = await res.json();
  expect(res.status === 200 && body.data?.length === 1,
    `GET documents → 1 document (reçu ${body.data?.length})`);

  res = await fetch(`${API}/watches/${watchId}/documents/${docId}`, { method: 'DELETE', headers });
  expect(res.status === 200, `DELETE document → 200 (reçu ${res.status})`);

  // ── 4. Alertes de cote : appel direct + anti-doublon ─────────────────────
  const [model] = await db
    .insert(watchModels)
    .values({ brand: 'SmokeTest', model: 'Alerte', canonicalName: 'SmokeTest Alerte' })
    .returning();
  modelId = model.id;
  await db.update(watches)
    .set({ watchModelId: model.id })
    .where(eq(watches.userId, userId));
  // Jeton factice : l'envoi Expo échouera (sent=0), on vérifie la trace en DB
  await db.insert(pushTokens).values({ token: `ExponentPushToken[smoke-${Date.now()}]`, userId, locale: 'fr' });

  await maybeSendPriceAlert({ watchModelId: model.id, previousPrice: 1000, newPrice: 1100 });
  let alerts = await db.select().from(priceAlerts).where(eq(priceAlerts.watchModelId, model.id));
  expect(alerts.length === 1, `maybeSendPriceAlert +10 % → 1 ligne price_alerts (reçu ${alerts.length})`);

  await maybeSendPriceAlert({ watchModelId: model.id, previousPrice: 1100, newPrice: 1300 });
  alerts = await db.select().from(priceAlerts).where(eq(priceAlerts.watchModelId, model.id));
  expect(alerts.length === 1, `2ᵉ variation < 7 j → anti-doublon, toujours 1 ligne (reçu ${alerts.length})`);

  const [model2] = await db
    .insert(watchModels)
    .values({ brand: 'SmokeTest', model: 'Alerte2', canonicalName: 'SmokeTest Alerte2' })
    .returning();
  await maybeSendPriceAlert({ watchModelId: model2.id, previousPrice: 1000, newPrice: 1020 });
  const alerts2 = await db.select().from(priceAlerts).where(eq(priceAlerts.watchModelId, model2.id));
  expect(alerts2.length === 0, `variation +2 % < seuil 5 % → aucune alerte (reçu ${alerts2.length})`);
  await db.delete(watchModels).where(eq(watchModels.id, model2.id));

  // Opt-out : nouvelle fenêtre (purge la trace), pref à false → aucune alerte
  await db.delete(priceAlerts).where(eq(priceAlerts.watchModelId, model.id));
  await db.insert(notificationPrefs).values({ userId, priceAlerts: false });
  await maybeSendPriceAlert({ watchModelId: model.id, previousPrice: 1000, newPrice: 1200 });
  alerts = await db.select().from(priceAlerts).where(eq(priceAlerts.watchModelId, model.id));
  expect(alerts.length === 0, `opt-out notification_prefs → aucune alerte (reçu ${alerts.length})`);

  // Prefs endpoints
  res = await fetch(`${API}/me/notification-prefs`, { headers });
  body = await res.json();
  expect(res.status === 200 && body.data?.priceAlerts === false,
    `GET /me/notification-prefs → false après opt-out (reçu ${body.data?.priceAlerts})`);
  res = await fetch(`${API}/me/notification-prefs`, {
    method: 'PATCH', headers, body: JSON.stringify({ priceAlerts: true }),
  });
  body = await res.json();
  expect(res.status === 200 && body.data?.priceAlerts === true,
    `PATCH /me/notification-prefs → true (reçu ${body.data?.priceAlerts})`);
} finally {
  // Nettoyage : lignes applicatives puis compte
  await db.delete(watchDocuments).where(eq(watchDocuments.userId, userId));
  await db.delete(watches).where(eq(watches.userId, userId));
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
  if (modelId) {
    await db.delete(marketPrices).where(eq(marketPrices.watchModelId, modelId));
    await db.delete(priceAlerts).where(eq(priceAlerts.watchModelId, modelId));
    await db.delete(watchModels).where(eq(watchModels.id, modelId));
  }
  await db.delete(recognitionEvents).where(eq(recognitionEvents.userId, userId));
  await db.delete(consumablePurchases).where(eq(consumablePurchases.userId, userId));
  await db.delete(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));
  await admin.auth.admin.deleteUser(userId);
  console.log('test user deleted');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) en échec`);
  process.exit(1);
}
console.log('\nTous les checks passent ✓');
process.exit(0);
