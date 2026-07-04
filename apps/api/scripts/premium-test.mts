// Smoke test du parcours freemium/premium — crée un user jetable, vérifie les
// quotas free, le webhook RevenueCat et les endpoints premium, puis nettoie.
// Prérequis : API lancée sur :3000 avec le même .env (REVENUECAT_WEBHOOK_SECRET inclus).
//   npx tsx --env-file=.env scripts/premium-test.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { entitlements, recognitionEvents, watches } from '../src/db/schema.js';

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

const email = `premium-test-${Date.now()}@watchy.test`;
const password = 'premium-test-Passw0rd!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;

try {
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  const headers = {
    Authorization: `Bearer ${session.session!.access_token}`,
    'Content-Type': 'application/json',
  };

  // 1. /me à l'état initial
  let res = await fetch(`${API}/me`, { headers });
  let me = (await res.json()).data;
  expect(res.status === 200 && me.plan === 'free' && me.watchCount === 0 && me.watchLimit === 5,
    `GET /me initial → free 0/5 (reçu ${me?.plan} ${me?.watchCount}/${me?.watchLimit})`);

  // 2. 5 montres passent, la 6ᵉ est bloquée
  for (let i = 1; i <= 5; i++) {
    res = await fetch(`${API}/watches`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${i}`, purchasePrice: 1000 * i }),
    });
    expect(res.status === 201, `create watch ${i}/5 → 201 (reçu ${res.status})`);
  }
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: 'Montre 6' }),
  });
  let body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `6ᵉ montre en free → 403 QUOTA_EXCEEDED (reçu ${res.status} ${body.error?.code})`);

  // 3. Portfolio verrouillé en free
  res = await fetch(`${API}/portfolio`, { headers });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'PREMIUM_REQUIRED',
    `GET /portfolio en free → 403 PREMIUM_REQUIRED (reçu ${res.status} ${body.error?.code})`);

  // 4. Quota de scans : 5 events posés en DB → le 6ᵉ scan est bloqué avant upload
  await db.insert(recognitionEvents).values(
    Array.from({ length: 5 }, () => ({ userId }))
  );
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  res = await fetch(`${API}/recognition`, {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64: png1x1, mimeType: 'image/png' }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'SCAN_QUOTA_EXCEEDED',
    `scan au-delà du quota → 403 SCAN_QUOTA_EXCEEDED (reçu ${res.status} ${body.error?.code})`);

  // 5. Webhook RevenueCat : mauvais secret refusé, bon secret → premium
  res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mauvais-secret' },
    body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: userId } }),
  });
  expect(res.status === 401, `webhook mauvais secret → 401 (reçu ${res.status})`);

  res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: userId,
        expiration_at_ms: Date.now() + 30 * 24 * 3600 * 1000,
      },
    }),
  });
  expect(res.status === 200, `webhook INITIAL_PURCHASE → 200 (reçu ${res.status})`);

  res = await fetch(`${API}/me`, { headers });
  me = (await res.json()).data;
  expect(me?.plan === 'premium' && me?.watchLimit === null,
    `GET /me après webhook → premium illimité (reçu ${me?.plan} ${me?.watchLimit})`);

  // 6. En premium : la 6ᵉ montre passe, le portfolio répond
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: 'Montre 6' }),
  });
  expect(res.status === 201, `6ᵉ montre en premium → 201 (reçu ${res.status})`);

  res = await fetch(`${API}/portfolio`, { headers });
  body = await res.json();
  expect(res.status === 200 && body.data?.totalWatches === 6 && body.data?.totalPurchase === 15000,
    `GET /portfolio premium → 6 montres, achat 15 000 € (reçu ${body.data?.totalWatches} / ${body.data?.totalPurchase})`);

  // 7. Rapport d'expert : accessible (vide) en premium — pas de génération (coût IA)
  const firstWatch = (await (await fetch(`${API}/watches`, { headers })).json()).data[0];
  res = await fetch(`${API}/watches/${firstWatch.id}/expert-report`, { headers });
  body = await res.json();
  expect(res.status === 200 && body.data?.report === null && body.data?.generating === false,
    `GET expert-report premium → 200 vide (reçu ${res.status})`);

  // 8. Expiration : le webhook EXPIRATION repasse en free
  res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ event: { type: 'EXPIRATION', app_user_id: userId } }),
  });
  me = (await (await fetch(`${API}/me`, { headers })).json()).data;
  expect(res.status === 200 && me?.plan === 'free',
    `webhook EXPIRATION → retour free (reçu ${me?.plan})`);

  // 9. Transfert d'achats entre comptes Apple : le premium suit le nouveau compte
  res = await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ event: { type: 'TRANSFER', transferred_to: [userId], transferred_from: [] } }),
  });
  me = (await (await fetch(`${API}/me`, { headers })).json()).data;
  expect(res.status === 200 && me?.plan === 'premium',
    `webhook TRANSFER → premium sur le compte destinataire (reçu ${me?.plan})`);
} finally {
  // Nettoyage : lignes applicatives puis compte
  await db.delete(watches).where(eq(watches.userId, userId));
  await db.delete(recognitionEvents).where(eq(recognitionEvents.userId, userId));
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
