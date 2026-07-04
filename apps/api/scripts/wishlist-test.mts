// Smoke test wishlist + alertes de prix — user jetable, aucune recherche IA
// déclenchée (saisie libre sur un modèle existant, cote fraîche insérée en DB).
//   npx tsx --env-file=.env scripts/wishlist-test.mts  (API lancée sur :3000)
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { entitlements, marketPrices, pushTokens, watchModels, wishlistItems } from '../src/db/schema.js';
import { checkPriceAlerts } from '../src/lib/price-alerts.js';
import { enrichModel } from '../src/lib/model-photo.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

let failures = 0;
function expect(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

const email = `wishlist-test-${Date.now()}@watchy.test`;
const password = 'wishlist-test-Passw0rd!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;
let insertedPriceId: string | null = null;

try {
  const { data: session } = await anon.auth.signInWithPassword({ email, password });
  const headers = {
    Authorization: `Bearer ${session!.session!.access_token}`,
    'Content-Type': 'application/json',
  };

  // Deux modèles du catalogue pour les deux chemins d'ajout
  const models = (await (await fetch(`${API}/watch-models?q=submariner`, { headers })).json()).data;
  const models2 = (await (await fetch(`${API}/watch-models?q=speedmaster`, { headers })).json()).data;
  const modelA = models[0];
  const modelB = models2.find((m: { id: string }) => m.id !== modelA.id) ?? models[1];

  // 1. Ajout par le catalogue
  let res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ watchModelId: modelA.id }),
  });
  expect(res.status === 201, `ajout catalogue → 201 (reçu ${res.status})`);

  // 2. Doublon refusé proprement
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ watchModelId: modelA.id }),
  });
  let body = await res.json();
  expect(res.status === 409 && body.error?.code === 'ALREADY_IN_WISHLIST',
    `doublon → 409 ALREADY_IN_WISHLIST (reçu ${res.status} ${body.error?.code})`);

  // 3. Saisie libre qui matche un modèle existant → dédupliqué, pas de création
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: modelB.brand, model: modelB.model }),
  });
  body = await res.json();
  expect(res.status === 201 && body.data?.watchModelId === modelB.id,
    `saisie libre dédupliquée sur le catalogue → 201, même modèle (reçu ${res.status}, ${body.data?.watchModelId === modelB.id ? 'même id' : 'id différent'})`);
  const itemB = body.data;

  // 4. GET : 2 items, cote présente pour le modèle A (seedé)
  res = await fetch(`${API}/wishlist`, { headers });
  const list = (await res.json()).data;
  expect(res.status === 200 && list.length === 2,
    `GET /wishlist → 2 items (reçu ${list?.length})`);
  const itemA = list.find((i: { watchModelId: string }) => i.watchModelId === modelA.id);
  expect(itemA?.currentPrice != null, `cote présente sur l'item catalogue (reçu ${itemA?.currentPrice})`);
  expect(itemA?.model?.canonicalName?.length > 0, 'modèle joint dans la réponse');

  // 5. Alerte de prix bloquée en free
  res = await fetch(`${API}/wishlist/${itemA.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ targetPrice: 5000 }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'PREMIUM_REQUIRED',
    `targetPrice en free → 403 PREMIUM_REQUIRED (reçu ${res.status} ${body.error?.code})`);
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'X', model: 'Y', targetPrice: 100 }),
  });
  expect(res.status === 403, `POST avec targetPrice en free → 403 (reçu ${res.status})`);

  // 6. Push token
  res = await fetch(`${API}/me/push-token`, {
    method: 'POST', headers, body: JSON.stringify({ token: 'ExponentPushToken[smoke-test]' }),
  });
  expect(res.status === 200, `push-token upsert → 200 (reçu ${res.status})`);

  // 7. Premium via webhook, puis alerte acceptée
  await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({
      event: { type: 'INITIAL_PURCHASE', app_user_id: userId, expiration_at_ms: Date.now() + 86400000 },
    }),
  });
  res = await fetch(`${API}/wishlist/${itemA.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ targetPrice: 5000 }),
  });
  expect(res.status === 200, `targetPrice en premium → 200 (reçu ${res.status})`);

  // 8. Cote fraîche sous le seuil insérée en DB (fraîche = pas de recherche IA
  //    déclenchée par le job) → l'alerte se déclenche en dry-run
  const [price] = await db
    .insert(marketPrices)
    .values({ watchModelId: modelA.id, price: '4200.00', currency: 'EUR', source: 'smoke-test' })
    .returning();
  insertedPriceId = price.id;

  const sent = await checkPriceAlerts({ dryRun: true });
  expect(sent >= 1, `alerts-check dry-run → ≥1 alerte détectée (reçu ${sent})`);
  const [itemRow] = await db.select().from(wishlistItems).where(eq(wishlistItems.id, itemA.id));
  expect(itemRow?.notifiedAt != null, 'notifiedAt posé après le passage');

  // 9. Pas de double notification pour la même cote
  const sentAgain = await checkPriceAlerts({ dryRun: true });
  expect(sentAgain === 0, `second passage → 0 alerte (anti-spam) (reçu ${sentAgain})`);

  // 10. Suppression
  res = await fetch(`${API}/wishlist/${itemB.id}`, { method: 'DELETE', headers });
  expect(res.status === 200, `DELETE item → 200 (reçu ${res.status})`);

  // 11. Cache négatif d'enrichissement : tentative récente → aucun appel IA relancé
  const [cacheModel] = await db
    .insert(watchModels)
    .values({
      brand: 'CacheTest',
      model: `NoPhoto ${Date.now()}`,
      canonicalName: `CacheTest NoPhoto ${Date.now()}`,
      enrichedAt: new Date(),
    })
    .returning();
  try {
    const enrichResult = await enrichModel(cacheModel.id);
    expect(enrichResult === 'skipped',
      `enrichModel sur tentative récente → 'skipped', zéro token (reçu '${enrichResult}')`);
  } finally {
    await db.delete(watchModels).where(eq(watchModels.id, cacheModel.id));
  }
} finally {
  if (insertedPriceId) await db.delete(marketPrices).where(eq(marketPrices.id, insertedPriceId));
  await db.delete(marketPrices).where(and(eq(marketPrices.source, 'smoke-test'), isNull(marketPrices.watchId)));
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
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
