// Smoke test suppression de compte (App Store 5.1.1(v)) + rate limit /auth/guest.
//   npx tsx --env-file=.env scripts/delete-test.mts  (API lancée sur :3000)
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import {
  entitlements,
  featureInterest,
  pushTokens,
  watches,
  wishlistItems,
} from '../src/db/schema.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';

let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };

// ——— 1. Suppression de compte ———
const email = `delete-test-${Date.now()}@watchy.test`;
const { data: created } = await admin.auth.admin.createUser({ email, password: 'Test-Passw0rd!', email_confirm: true });
const userId = created!.user.id;

const { data: s } = await anon.auth.signInWithPassword({ email, password: 'Test-Passw0rd!' });
const headers = { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' };

// Semer des données dans chaque table + un fichier storage
await fetch(`${API}/watches`, { method: 'POST', headers, body: JSON.stringify({ brand: 'DeleteTest', model: 'Montre', purchasePrice: 100 }) });
const models = (await (await fetch(`${API}/watch-models?q=submariner`, { headers })).json()).data;
await fetch(`${API}/wishlist`, { method: 'POST', headers, body: JSON.stringify({ watchModelId: models[0].id }) });
await fetch(`${API}/me/push-token`, { method: 'POST', headers, body: JSON.stringify({ token: 'ExponentPushToken[delete-test]' }) });
await fetch(`${API}/me/feature-interest`, { method: 'POST', headers, body: JSON.stringify({ feature: 'community' }) });
await db.insert(entitlements).values({ userId, plan: 'premium', source: 'promo' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await admin.storage.from('watch-photos').upload(`${userId}/delete-test.png`, png, { contentType: 'image/png' });

// Supprimer
let res = await fetch(`${API}/me`, { method: 'DELETE', headers });
expect(res.status === 200, `DELETE /me → 200 (reçu ${res.status})`);

// Vérifier que tout est parti
const counts = await Promise.all([
  db.select().from(watches).where(eq(watches.userId, userId)),
  db.select().from(wishlistItems).where(eq(wishlistItems.userId, userId)),
  db.select().from(pushTokens).where(eq(pushTokens.userId, userId)),
  db.select().from(featureInterest).where(eq(featureInterest.userId, userId)),
  db.select().from(entitlements).where(eq(entitlements.userId, userId)),
]);
expect(counts.every((rows) => rows.length === 0),
  `tables applicatives vides (reçu ${counts.map((r) => r.length).join(',')})`);

const { data: storageFiles } = await admin.storage.from('watch-photos').list(userId);
expect((storageFiles ?? []).length === 0, `dossier storage purgé (reçu ${storageFiles?.length ?? 0} fichier(s))`);

res = await fetch(`${API}/me`, { headers });
expect(res.status === 401, `ancien token invalide → 401 (reçu ${res.status})`);

const { data: gone, error: goneErr } = await admin.auth.admin.getUserById(userId);
expect(goneErr != null || gone?.user == null, 'utilisateur absent de auth');

// ——— 2. Rate limit /auth/guest : 5/h par IP ———
const guestEmails: string[] = [];
let got429 = false;
for (let i = 1; i <= 6; i++) {
  const r = await fetch(`${API}/auth/guest`, { method: 'POST' });
  if (r.status === 429) { got429 = true; break; }
  const body = await r.json();
  if (body.data?.email) guestEmails.push(body.data.email);
}
expect(got429, `6ᵉ création d'invité bloquée → 429 (invités créés : ${guestEmails.length})`);

// Nettoyage des invités créés par le test
const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
for (const u of page?.users ?? []) {
  if (u.email && guestEmails.includes(u.email)) await admin.auth.admin.deleteUser(u.id);
}
console.log(`${guestEmails.length} invité(s) de test nettoyé(s)`);

if (failures) { console.error(`\n${failures} échec(s)`); process.exit(1); }
console.log('\nTous les checks passent ✓');
process.exit(0);
