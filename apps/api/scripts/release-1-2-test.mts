// Smoke test release 1.2 — packs consommables (scans, emplacements), coffre-fort
// documents et alertes de cote. Crée un user jetable, joue les webhooks
// RevenueCat consommables (avec rejeu pour l'idempotence), puis nettoie.
// Prérequis : API lancée sur :3000 avec le même .env (REVENUECAT_WEBHOOK_SECRET
// inclus) et bucket privé watch-documents créé.
//   npx tsx --env-file=.env scripts/release-1-2-test.mts
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
  scanCredits,
  watchDocuments,
  watches,
  watchModels,
} from '../src/db/schema.js';
import { maybeSendPriceAlert } from '../src/lib/price-alerts.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

let failures = 0;
function expect(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

async function rcEvent(event: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ event }),
  });
  return res.status;
}

const email = `release12-test-${Date.now()}@watchy.test`;
const password = 'release12-test-Passw0rd!';
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

  // ── 1. Pack de scans : crédit via webhook + idempotence ──────────────────
  let m = await me();
  expect(m.scanCredits === 0, `GET /me initial → 0 crédit de scan (reçu ${m.scanCredits})`);

  let status = await rcEvent({
    id: 'evt-scans-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_scans_5',
  });
  m = await me();
  expect(status === 200 && m.scanCredits === 5,
    `webhook watchy_scans_5 → 5 crédits (reçu ${status} / ${m.scanCredits})`);

  status = await rcEvent({
    id: 'evt-scans-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_scans_5',
  });
  m = await me();
  expect(status === 200 && m.scanCredits === 5,
    `rejeu du même event.id → toujours 5 crédits, idempotent (reçu ${m.scanCredits})`);

  // Remboursement → crédits repris
  status = await rcEvent({
    id: 'evt-scans-refund', type: 'CANCELLATION', app_user_id: userId, product_id: 'watchy_scans_5',
  });
  m = await me();
  expect(status === 200 && m.scanCredits === 0,
    `refund watchy_scans_5 → 0 crédit (reçu ${m.scanCredits})`);

  // ── 2. Mensuel d'abord, crédits ensuite : 5 events posés + 2 crédits →
  // le scan passe le gate quota (l'IA échouera sur le PNG 1×1, peu importe :
  // 403 = gate fermé, tout autre statut = gate passé)
  await db.insert(recognitionEvents).values(Array.from({ length: 5 }, () => ({ userId })));
  let res = await fetch(`${API}/recognition`, {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64: png1x1, mimeType: 'image/png' }),
  });
  let body = await res.json();
  expect(res.status === 403 && body.error?.code === 'SCAN_QUOTA_EXCEEDED',
    `scan sans crédit au-delà du mensuel → 403 (reçu ${res.status} ${body.error?.code})`);

  await rcEvent({
    id: 'evt-scans-2', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_scans_5',
  });
  res = await fetch(`${API}/recognition`, {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64: png1x1, mimeType: 'image/png' }),
  });
  m = await me();
  expect(res.status !== 403 && m.scanCredits === 4,
    `scan avec crédits → passe et débite 1 crédit (reçu ${res.status}, solde ${m.scanCredits})`);

  // ── 3. Emplacements à l'unité ────────────────────────────────────────────
  for (let i = 1; i <= 5; i++) {
    await fetch(`${API}/watches`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${i}` }),
    });
  }
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers, body: JSON.stringify({ brand: 'SmokeTest', model: 'Montre 6' }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `6ᵉ montre sans pack → 403 QUOTA_EXCEEDED (reçu ${res.status})`);

  status = await rcEvent({
    id: 'evt-slots-1', type: 'NON_RENEWING_PURCHASE', app_user_id: userId, product_id: 'watchy_slots_3',
  });
  m = await me();
  expect(status === 200 && m.slotsLimit === 8,
    `webhook watchy_slots_3 → limite 8 (reçu ${m.slotsLimit})`);

  for (let i = 6; i <= 8; i++) {
    res = await fetch(`${API}/watches`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${i}` }),
    });
    expect(res.status === 201, `montre ${i}/8 avec pack → 201 (reçu ${res.status})`);
  }
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers, body: JSON.stringify({ brand: 'SmokeTest', model: 'Montre 9' }),
  });
  expect(res.status === 403, `9ᵉ montre → 403, la limite 8 tient (reçu ${res.status})`);

  // ── 4. Coffre-fort documents ─────────────────────────────────────────────
  const watchesRes = await (await fetch(`${API}/watches`, { headers })).json();
  const watchId = watchesRes.data[0].id as string;

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

  // ── 5. Alertes de cote : appel direct + anti-doublon ─────────────────────
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

  await maybeSendPriceAlert({ watchModelId: model.id, previousPrice: 1000, newPrice: 1020 });
  // (variation 2 % : ne créerait de toute façon rien — vérifie le seuil sur un modèle vierge)
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
  if (modelId) {
    await db.delete(marketPrices).where(eq(marketPrices.watchModelId, modelId));
    await db.delete(priceAlerts).where(eq(priceAlerts.watchModelId, modelId));
    await db.delete(watchModels).where(eq(watchModels.id, modelId));
  }
  await db.delete(recognitionEvents).where(eq(recognitionEvents.userId, userId));
  await db.delete(scanCredits).where(eq(scanCredits.userId, userId));
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
