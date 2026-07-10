// Smoke test du back office : auth par jeton, 5 pages, agrégats acquisition
// et coûts. Prérequis : API sur :3000 avec ADMIN_TOKEN dans le même .env.
//   npx tsx --env-file=.env scripts/admin-test.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { acquisitionSources, adminTokens, aiUsage, entitlements, profiles } from '../src/db/schema.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const TOKEN = process.env.ADMIN_TOKEN!;

let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };

const email = `admin-test-${Date.now()}@watchy.test`;
const password = 'admin-test-Passw0rd!';
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const userId = created!.user.id;
let fakeUsageId: string | null = null;

try {
  // 1. Sans cookie : page de connexion, aucun KPI exposé
  let res = await fetch(`${API}/admin`);
  let html = await res.text();
  expect(html.includes("Jeton d'administration") && !html.includes('Inscrits'),
    'GET /admin sans cookie → page de connexion, zéro donnée');

  // 2. Mauvais jeton refusé
  res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'token=mauvais',
  });
  expect(res.status === 401, `login mauvais jeton → 401 (reçu ${res.status})`);

  // 3. Bon jeton → cookie → les 5 pages répondent
  res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${TOKEN}`,
    redirect: 'manual',
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(res.status === 302 && cookie.startsWith('watchy_admin='), 'login bon jeton → 302 + cookie');

  const headers = { Cookie: cookie };
  for (const [path, marker] of [
    ['/admin', 'Inscrits'],
    ['/admin/acquisition', 'Sources'],
    ['/admin/revenue', 'MRR'],
    ['/admin/costs', 'ROI'],
    ['/admin/users', 'derniers inscrits'],
  ] as const) {
    res = await fetch(`${API}${path}`, { headers });
    html = await res.text();
    expect(res.status === 200 && html.includes(marker), `GET ${path} → 200 + « ${marker} »`);
  }

  // 4. La réponse acquisition d'un utilisateur remonte dans la page
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  res = await fetch(`${API}/me/acquisition-source`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'tiktok' }),
  });
  expect(res.status === 200, `POST /me/acquisition-source → 200 (reçu ${res.status})`);
  html = await (await fetch(`${API}/admin/acquisition`, { headers })).text();
  expect(html.includes('TikTok'), 'la source TikTok apparaît dans /admin/acquisition');

  // 4bis. Profil déclaratif : PATCH partiel + validation stricte
  res = await fetch(`${API}/me/profile`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expertise: 'collectionneur', ageRange: '25-34', city: 'Avignon' }),
  });
  let profile = (await res.json()).data;
  expect(res.status === 200 && profile.expertise === 'collectionneur' && profile.city === 'Avignon',
    `PATCH /me/profile → 200 (reçu ${res.status} ${profile?.expertise}/${profile?.city})`);
  res = await fetch(`${API}/me/profile`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expertise: 'expert-mondial' }),
  });
  expect(res.status === 400, `PATCH expertise invalide → 400 (reçu ${res.status})`);
  profile = (await (await fetch(`${API}/me/profile`, {
    headers: { Authorization: `Bearer ${s!.session!.access_token}` },
  })).json()).data;
  expect(profile.ageRange === '25-34' && profile.expertise === 'collectionneur',
    'GET /me/profile → valeurs persistées');
  html = await (await fetch(`${API}/admin/acquisition`, { headers })).text();
  expect(html.includes('Collectionneur') && html.includes('25-34'),
    'expertise et tranche d\'âge visibles dans /admin/acquisition');

  // 5. Un coût IA inséré remonte dans les totaux
  const [row] = await db
    .insert(aiUsage)
    .values({ label: 'test admin', model: 'claude-sonnet-4-6', costUsd: '0.1234', searches: 2, userId })
    .returning({ id: aiUsage.id });
  fakeUsageId = row.id;
  html = await (await fetch(`${API}/admin/costs`, { headers })).text();
  expect(html.includes('test admin'), 'l\'appel IA de test apparaît dans /admin/costs');
  // 6. Équipe : créer un jeton d'équipe → il ouvre les dashboards mais pas /admin/team
  res = await fetch(`${API}/admin/team/create`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'label=Collegue+Test',
    redirect: 'manual',
  });
  const teamToken = res.headers.get('location')?.split('created=')[1] ?? '';
  expect(res.status === 302 && teamToken.length === 48, 'création jeton équipe → 302 + jeton');
  res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${teamToken}`,
    redirect: 'manual',
  });
  const teamCookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(res.status === 302, 'login avec jeton équipe → 302');
  res = await fetch(`${API}/admin/costs`, { headers: { Cookie: teamCookie } });
  expect(res.status === 200, 'jeton équipe → dashboards accessibles');
  html = await (await fetch(`${API}/admin/team`, { headers: { Cookie: teamCookie } })).text();
  expect(html.includes('Réservé au jeton maître'), 'jeton équipe → /admin/team refusé');
  res = await fetch(`${API}/admin/users/premium`, {
    method: 'POST',
    headers: { Cookie: teamCookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `userId=${userId}&action=grant`,
  });
  expect(res.status === 403, 'jeton équipe → grant premium refusé (403)');

  // 7. Premium promo par le maître : grant → /me premium → revoke → free
  await fetch(`${API}/admin/users/premium`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `userId=${userId}&action=grant`,
    redirect: 'manual',
  });
  let me = (await (await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${s!.session!.access_token}` },
  })).json()).data;
  expect(me.plan === 'premium', `grant maître → /me premium (reçu ${me.plan})`);
  await fetch(`${API}/admin/users/premium`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `userId=${userId}&action=revoke`,
    redirect: 'manual',
  });
  me = (await (await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${s!.session!.access_token}` },
  })).json()).data;
  expect(me.plan === 'free', `revoke maître → /me free (reçu ${me.plan})`);

  // 8. Révocation du jeton d'équipe → login refusé
  const revokeId = (await db.select().from(adminTokens)).find((t) => t.label === 'Collegue Test')?.id;
  await fetch(`${API}/admin/team/revoke`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `id=${revokeId}`,
    redirect: 'manual',
  });
  res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${teamToken}`,
  });
  expect(res.status === 401, 'jeton révoqué → login 401');
} finally {
  await db.delete(adminTokens).where(eq(adminTokens.label, 'Collegue Test'));
  if (fakeUsageId) await db.delete(aiUsage).where(eq(aiUsage.id, fakeUsageId));
  await db.delete(acquisitionSources).where(eq(acquisitionSources.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));
  await admin.auth.admin.deleteUser(userId);
  console.log('test user deleted');
}

if (failures) { console.error(`\n${failures} échec(s)`); process.exit(1); }
console.log('\nTous les checks passent ✓');
process.exit(0);
