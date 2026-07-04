// Smoke test « Me prévenir » — user jetable, POST idempotent + GET
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { featureInterest } from '../src/db/schema.js';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, rt);
const email = `interest-test-${Date.now()}@watchy.test`;
const { data: created } = await admin.auth.admin.createUser({ email, password: 'Test-Passw0rd!', email_confirm: true });
const userId = created!.user.id;
let failures = 0;
const expect = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failures++; };
try {
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'Test-Passw0rd!' });
  const headers = { Authorization: `Bearer ${s!.session!.access_token}`, 'Content-Type': 'application/json' };
  let res = await fetch('http://localhost:3000/me/feature-interest', { headers });
  let body = await res.json();
  expect(res.status === 200 && body.data.features.length === 0, `GET initial → vide (reçu ${JSON.stringify(body.data)})`);
  res = await fetch('http://localhost:3000/me/feature-interest', { method: 'POST', headers, body: JSON.stringify({ feature: 'community' }) });
  expect(res.status === 200, `POST community → 200 (reçu ${res.status})`);
  res = await fetch('http://localhost:3000/me/feature-interest', { method: 'POST', headers, body: JSON.stringify({ feature: 'community' }) });
  expect(res.status === 200, `POST doublon → 200 idempotent (reçu ${res.status})`);
  res = await fetch('http://localhost:3000/me/feature-interest', { method: 'POST', headers, body: JSON.stringify({ feature: 'hacking' }) });
  expect(res.status === 400, `POST feature inconnue → 400 (reçu ${res.status})`);
  body = await (await fetch('http://localhost:3000/me/feature-interest', { headers })).json();
  expect(body.data.features.length === 1 && body.data.features[0] === 'community', `GET → ['community'] (reçu ${JSON.stringify(body.data.features)})`);
} finally {
  await db.delete(featureInterest).where(eq(featureInterest.userId, userId));
  await admin.auth.admin.deleteUser(userId);
  console.log('test user deleted');
}
if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('\nTous les checks passent ✓');
process.exit(0);
