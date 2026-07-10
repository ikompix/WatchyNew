// Smoke test surnom de collectionneur : auto-fill depuis la référence à la
// création, recalcul quand la référence change, surnom explicite respecté.
// Aucun appel IA déclenché.
//   npx tsx --env-file=.env scripts/nickname-test.mts  (API sur :3000)
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';

let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };

const email = `nickname-test-${Date.now()}@watchy.test`;
const password = 'nickname-test-Passw0rd!';
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const userId = created!.user.id;

try {
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const headers = { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' };

  // 1. Création avec référence iconique sans surnom → auto-fill « Pepsi »
  let res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'Rolex', model: 'GMT-Master II', reference: '126710BLRO' }),
  });
  let body = await res.json();
  const watchId = body.data?.id;
  expect(res.status === 201 && body.data?.nickname === 'Pepsi',
    `création réf 126710BLRO → nickname "Pepsi" (reçu ${res.status} ${JSON.stringify(body.data?.nickname)})`);

  // 2. Surnom explicite (reco IA) prioritaire sur le mapping
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'Rolex', model: 'Submariner', reference: '116610LV', nickname: 'Hulk vérifié' }),
  });
  body = await res.json();
  const watchId2 = body.data?.id;
  expect(res.status === 201 && body.data?.nickname === 'Hulk vérifié',
    `création avec surnom explicite → conservé (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 3. Référence inconnue sans surnom → null
  res = await fetch(`${API}/watches`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand: 'SmokeTest', model: 'Sans surnom', reference: 'XYZ-000' }),
  });
  body = await res.json();
  const watchId3 = body.data?.id;
  expect(res.status === 201 && body.data?.nickname == null,
    `réf inconnue → nickname null (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 4. PATCH : référence changée sans surnom saisi → recalcul (« Hulk »)
  res = await fetch(`${API}/watches/${watchId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ reference: '116610LV', nickname: null }),
  });
  body = await res.json();
  expect(res.status === 200 && body.data?.nickname === 'Hulk',
    `PATCH réf → 116610LV sans surnom → recalculé "Hulk" (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 5. PATCH : référence changée vers une réf hors mapping → surnom effacé (plus de mensonge)
  res = await fetch(`${API}/watches/${watchId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ reference: '124060' }),
  });
  body = await res.json();
  expect(res.status === 200 && body.data?.nickname == null,
    `PATCH réf hors mapping → surnom effacé (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 6. PATCH : surnom explicite posé, référence inchangée → respecté
  res = await fetch(`${API}/watches/${watchId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ nickname: 'No-Date' }),
  });
  body = await res.json();
  expect(res.status === 200 && body.data?.nickname === 'No-Date',
    `PATCH surnom explicite → persisté (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 7. PATCH : effacement explicite (référence inchangée) → null respecté
  res = await fetch(`${API}/watches/${watchId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ nickname: null }),
  });
  body = await res.json();
  expect(res.status === 200 && body.data?.nickname == null,
    `PATCH nickname null (réf inchangée) → effacé (reçu ${JSON.stringify(body.data?.nickname)})`);

  // 8. GET liste : le surnom est exposé
  res = await fetch(`${API}/watches`, { headers });
  body = await res.json();
  const w2 = body.data?.find((w: { id: string }) => w.id === watchId2);
  expect(res.status === 200 && w2?.nickname === 'Hulk vérifié',
    `GET /watches expose nickname (reçu ${JSON.stringify(w2?.nickname)})`);

  for (const id of [watchId, watchId2, watchId3]) {
    if (id) await fetch(`${API}/watches/${id}`, { method: 'DELETE', headers });
  }
} finally {
  await admin.auth.admin.deleteUser(userId);
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent');
process.exit(failures ? 1 : 0);
