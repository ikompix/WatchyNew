import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY!, rt);

const email = `reco-test-${Date.now()}@watchy.test`;
const password = 'reco-test-Passw0rd!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) throw createErr;

try {
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  const headers = {
    Authorization: `Bearer ${session.session!.access_token}`,
    'Content-Type': 'application/json',
  };

  const imageBase64 = readFileSync(process.argv[2] ?? '/tmp/test-watch.jpg').toString('base64');
  console.log(`image: ${Math.round(imageBase64.length / 1024)} Ko base64 — envoi…`);
  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/recognition', {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  });
  const json = await res.json();
  console.log(`status ${res.status} en ${Date.now() - t0}ms`);
  const d = json.data;
  if (d) {
    console.log(`isWatch=${d.isWatch} confiance=${d.confidence}`);
    console.log(`identifié : ${d.brand} ${d.model} ${d.reference ?? '(pas de réf)'} — cadran ${d.dialColor ?? '?'}`);
    console.log(`match catalogue : ${d.matched ? d.matched.canonicalName : 'aucun'}`);
    console.log(`candidates : ${JSON.stringify(d.referenceCandidates, null, 1)}`);
    console.log(`alternatives : ${d.alternatives.map((a: any) => a.canonicalName).join(' | ') || '—'}`);
    console.log(`photo : ${d.photoUrl}`);
  } else {
    console.log('erreur :', json.error);
  }
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
  console.log('user de test supprimé');
}
