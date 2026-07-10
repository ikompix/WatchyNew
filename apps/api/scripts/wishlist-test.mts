// Smoke test wishlist post-pivot : quota COMBINÉ (collection + wishlist = 5 en
// free), photo facultative, plus d'alertes. Aucun appel IA déclenché.
//   npx tsx --env-file=.env scripts/wishlist-test.mts  (API sur :3000)
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { entitlements, wishlistItems, watches } from '../src/db/schema.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };

const email = `wishlist-test-${Date.now()}@watchy.test`;
const password = 'wishlist-test-Passw0rd!';
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const userId = created!.user.id;

try {
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const headers = { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' };

  const models = (await (await fetch(`${API}/watch-models?q=submariner`, { headers })).json()).data;
  const models2 = (await (await fetch(`${API}/watch-models?q=speedmaster`, { headers })).json()).data;
  const modelA = models[0];
  const modelB = models2.find((m: { id: string }) => m.id !== modelA.id) ?? models[1];

  // 1. Quota combiné : 3 montres + 2 items wishlist = 5 emplacements
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`${API}/watches`, {
      method: 'POST', headers,
      body: JSON.stringify({ brand: 'SmokeTest', model: `Montre ${i}` }),
    });
    expect(r.status === 201, `montre ${i}/3 → 201 (reçu ${r.status})`);
  }
  let res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers,
    body: JSON.stringify({ watchModelId: modelA.id, photoUrl: 'https://example.com/photo.jpg' }),
  });
  let body = await res.json();
  expect(res.status === 201 && body.data?.photoUrl === 'https://example.com/photo.jpg',
    `wishlist 1 avec photo → 201, photoUrl persistée (reçu ${res.status})`);
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ watchModelId: modelB.id }),
  });
  expect(res.status === 201, `wishlist 2 → 201 (reçu ${res.status})`);

  // 2. 6ᵉ emplacement refusé en free — côté wishlist ET côté collection
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ brand: 'X', model: 'Overflow' }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `6ᵉ emplacement (wishlist) → 403 QUOTA_EXCEEDED (reçu ${res.status} ${body.error?.code})`);
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers, body: JSON.stringify({ brand: 'SmokeTest', model: 'Overflow' }),
  });
  body = await res.json();
  expect(res.status === 403 && body.error?.code === 'QUOTA_EXCEEDED',
    `6ᵉ emplacement (montre) → 403 QUOTA_EXCEEDED (reçu ${res.status} ${body.error?.code})`);

  // 3. /me expose le quota combiné
  const me = (await (await fetch(`${API}/me`, { headers })).json()).data;
  expect(me.slotsUsed === 5 && me.slotsLimit === 5 && me.watchCount === 3 && me.wishlistCount === 2,
    `GET /me → slots 5/5 (3 montres + 2 wishlist) (reçu ${JSON.stringify({ s: me.slotsUsed, l: me.slotsLimit, w: me.watchCount, wl: me.wishlistCount })})`);

  // 4. Doublon wishlist refusé proprement
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ watchModelId: modelA.id }),
  });
  body = await res.json();
  expect(res.status === 409 && body.error?.code === 'ALREADY_IN_WISHLIST',
    `doublon → 409 (reçu ${res.status} ${body.error?.code})`);

  // 5. Premium (webhook) → 6ᵉ emplacement accepté
  await fetch(`${API}/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
    body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: userId, expiration_at_ms: Date.now() + 86400000 } }),
  });
  res = await fetch(`${API}/wishlist`, {
    method: 'POST', headers, body: JSON.stringify({ brand: 'X', model: 'Overflow' }),
  });
  expect(res.status === 201, `6ᵉ emplacement en premium → 201 (reçu ${res.status})`);

  // 6. GET wishlist : items avec photo/cote/modèle joint
  const list = (await (await fetch(`${API}/wishlist`, { headers })).json()).data;
  expect(list.length === 3, `GET /wishlist → 3 items (reçu ${list?.length})`);
  const withPhoto = list.find((i: { photoUrl: string | null }) => i.photoUrl);
  expect(!!withPhoto, 'item avec photoUrl présent dans la liste');
} finally {
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
  await db.delete(watches).where(eq(watches.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));
  await admin.auth.admin.deleteUser(userId);
  console.log('test user deleted');
}

if (failures) { console.error(`\n${failures} échec(s)`); process.exit(1); }
console.log('\nTous les checks passent ✓');
process.exit(0);
