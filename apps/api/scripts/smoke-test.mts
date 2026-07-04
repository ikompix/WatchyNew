import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };

const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const URL = process.env.SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(URL, ANON_KEY, rt);

const email = `smoke-test-${Date.now()}@watchy.test`;
const password = 'smoke-test-Passw0rd!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (createErr) throw createErr;

try {
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  const token = session.session!.access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Catalog search
  let res = await fetch('http://localhost:3000/watch-models?q=submariner', { headers });
  const models = (await res.json()).data;
  console.log('watch-models?q=submariner →', res.status, models.length, 'results:', models[0]?.canonicalName);

  // 2. Market prices for first model
  res = await fetch(`http://localhost:3000/market-prices/${models[0].id}`, { headers });
  const prices = (await res.json()).data;
  console.log('market-prices →', res.status, prices.length, 'points, latest:', prices[0]?.price, prices[0]?.currency);

  // 3. Recognition (no ANTHROPIC_API_KEY → photo stored, no identification)
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  res = await fetch('http://localhost:3000/recognition', {
    method: 'POST', headers,
    body: JSON.stringify({ imageBase64: png1x1, mimeType: 'image/png' }),
  });
  const rec = await res.json();
  console.log('recognition →', res.status, JSON.stringify(rec.data ?? rec.error));

  // 4. Create a watch linked to the model, with the stored photo
  res = await fetch('http://localhost:3000/watches', {
    method: 'POST', headers,
    body: JSON.stringify({
      brand: models[0].brand, model: models[0].model, reference: models[0].reference,
      watchModelId: models[0].id, photoUrl: rec.data?.photoUrl, purchasePrice: 9000,
    }),
  });
  const watch = (await res.json()).data;
  console.log('create watch →', res.status, watch?.id, 'completion:', watch?.completionPct, '%');

  // 5. Photo publicly reachable?
  if (rec.data?.photoUrl) {
    const photo = await fetch(rec.data.photoUrl);
    console.log('photo public URL →', photo.status, photo.headers.get('content-type'));
  }

  // cleanup: delete watch
  if (watch?.id) {
    res = await fetch(`http://localhost:3000/watches/${watch.id}`, { method: 'DELETE', headers });
    console.log('delete watch →', res.status);
  }
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
  console.log('test user deleted');
}
