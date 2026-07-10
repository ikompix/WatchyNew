import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'https://api-production-db39.up.railway.app';
const email = `prod-smoke-${Date.now()}@watchy.test`;
const { data: created } = await admin.auth.admin.createUser({ email, password: 'Test-Passw0rd!', email_confirm: true });
let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };
try {
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'Test-Passw0rd!' });
  const headers = { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' };
  let res = await fetch(`${API}/me`, { headers });
  let body = await res.json().catch(() => null);
  expect(res.status === 200 && body?.data?.plan === 'free', `GET /me → 200 free (reçu ${res.status} ${JSON.stringify(body?.data)})`);
  res = await fetch(`${API}/watch-models?q=batman`, { headers });
  body = await res.json().catch(() => null);
  expect(res.status === 200 && (body?.data?.length ?? 0) > 0, `recherche « batman » → ${body?.data?.length} résultat(s)`);
  res = await fetch(`${API}/watches`, { method: 'POST', headers, body: JSON.stringify({ brand: 'ProdSmoke', model: 'Test', purchasePrice: 42 }) });
  body = await res.json().catch(() => null);
  expect(res.status === 201 && !!body?.data?.id, `création montre → 201 (reçu ${res.status})`);
  res = await fetch(`${API}/wishlist`, { headers });
  expect(res.status === 200, `GET /wishlist → 200 (reçu ${res.status})`);
  res = await fetch(`${API}/me`, { method: 'DELETE', headers });
  expect(res.status === 200, `DELETE /me → 200 (reçu ${res.status})`);
} finally {
  await admin.auth.admin.deleteUser(created!.user.id).catch(() => {});
  console.log('cleanup ok');
}
if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('\nProduction opérationnelle ✓');
process.exit(0);
