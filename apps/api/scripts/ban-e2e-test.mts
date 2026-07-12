// Test e2e du ban BO (compte invité jetable, auto-nettoyé).
// Local : npx tsx --env-file=.env scripts/ban-e2e-test.mts (API=http://localhost:3000)
// Prod  : npx tsx --env-file=.env.prod.bak scripts/ban-e2e-test.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const API = process.env.BAN_TEST_API ?? 'https://api.watchy-app.com';
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
  realtime: { transport: ws as unknown as typeof WebSocket },
});
let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };

const guestRes = await fetch(`${API}/auth/guest`, { method: 'POST' });
const guest = (await guestRes.json()).data as { email: string; password: string };
const { data: s } = await anon.auth.signInWithPassword({ email: guest.email, password: guest.password });
const access = s!.session!.access_token;
const userId = s!.session!.user.id;
const authHeaders = { Authorization: `Bearer ${access}` };

let res = await fetch(`${API}/me`, { headers: authHeaders });
expect(res.status === 200, `GET /me avant ban → 200 (reçu ${res.status})`);

const login = await fetch(`${API}/admin/login`, {
  method: 'POST',
  body: new URLSearchParams({ token: process.env.ADMIN_TOKEN! }),
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
expect(login.status === 302 && cookie.startsWith('watchy_admin='), 'login BO → 302 + cookie');

res = await fetch(`${API}/admin/users/ban`, {
  method: 'POST', headers: { cookie }, redirect: 'manual',
  body: new URLSearchParams({ userId, reason: 'test e2e (auto-nettoyé)' }),
});
expect(res.status === 302, `POST ban → 302 (reçu ${res.status})`);
res = await fetch(`${API}/me`, { headers: authHeaders });
const body = await res.json().catch(() => null);
expect(res.status === 403 && body?.error?.code === 'ACCOUNT_BANNED', `GET /me banni → 403 ACCOUNT_BANNED (reçu ${res.status} ${body?.error?.code})`);

res = await fetch(`${API}/admin/users/${userId}`, { headers: { cookie } });
const html = await res.text();
expect(res.status === 200 && html.includes('banni'), 'fiche détail → statut banni affiché');

res = await fetch(`${API}/admin/users/unban`, {
  method: 'POST', headers: { cookie }, redirect: 'manual',
  body: new URLSearchParams({ userId }),
});
expect(res.status === 302, `POST unban → 302 (reçu ${res.status})`);
res = await fetch(`${API}/me`, { headers: authHeaders });
expect(res.status === 200, `GET /me après unban → 200 (reçu ${res.status})`);

res = await fetch(`${API}/me`, { method: 'DELETE', headers: authHeaders });
expect(res.status === 200, `DELETE /me (cleanup) → 200 (reçu ${res.status})`);

console.log(failures ? `\n${failures} échec(s)` : '\nBan e2e ✓');
process.exit(failures ? 1 : 0);
