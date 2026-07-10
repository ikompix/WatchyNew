// Smoke test du verrouillage free au-delà du quota — crée un compte de démo
// RÉUTILISABLE (non supprimé à la fin) : premium via webhook → 7 montres →
// expiration → free, puis vérifie les flags locked et les 403.
// Prérequis : API lancée sur :3000 avec le même .env (REVENUECAT_WEBHOOK_SECRET inclus).
//   npx tsx --env-file=.env scripts/locked-test.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);
const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY!, rt);
const API = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET!;

const EMAIL = 'demo-locked@watchy.test';
const PASSWORD = 'Watchy-Demo-2026!';

let failures = 0;
function expect(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

// Compte réutilisable : on repart de zéro s'il existe déjà
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existing = list?.users.find((u) => u.email === EMAIL);
if (existing) {
  await admin.auth.admin.deleteUser(existing.id);
  console.log('compte de démo existant supprimé, recréation…');
}
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;

const { data: session, error: signErr } = await anon.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (signErr) throw signErr;
const headers = {
  Authorization: `Bearer ${session.session!.access_token}`,
  'Content-Type': 'application/json',
};

// 1. Premium via webhook (comme un vrai essai 7 jours)
let res = await fetch(`${API}/webhooks/revenuecat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
  body: JSON.stringify({
    event: {
      type: 'INITIAL_PURCHASE',
      app_user_id: userId,
      expiration_at_ms: Date.now() + 7 * 24 * 3600 * 1000,
    },
  }),
});
expect(res.status === 200, `webhook INITIAL_PURCHASE → premium (reçu ${res.status})`);

// 2. 7 montres en premium (l'ordre d'insertion fixe l'ancienneté)
const SEED = [
  { brand: 'Rolex', model: 'Submariner Date', reference: '126610LN', purchasePrice: 9500, productionYear: 2022, condition: 'tres_bon', hasPapers: true, hasBox: true },
  { brand: 'Omega', model: 'Speedmaster Moonwatch', reference: '310.30.42.50.01.002', purchasePrice: 6200, productionYear: 2021, condition: 'tres_bon', hasPapers: true, hasBox: true },
  { brand: 'Tudor', model: 'Black Bay 58', reference: '79030N', purchasePrice: 3400, productionYear: 2020, condition: 'bon', hasPapers: false, hasBox: true },
  { brand: 'Seiko', model: 'Prospex SPB143', reference: 'SPB143J1', purchasePrice: 1100, productionYear: 2021, condition: 'bon', hasPapers: false, hasBox: false },
  { brand: 'Cartier', model: 'Santos Medium', reference: 'WSSA0029', purchasePrice: 6800, productionYear: 2023, condition: 'neuf', hasPapers: true, hasBox: true },
  { brand: 'Jaeger-LeCoultre', model: 'Reverso Classic', reference: 'Q3858520', purchasePrice: 7200, productionYear: 2019, condition: 'tres_bon', hasPapers: true, hasBox: false },
  { brand: 'Grand Seiko', model: 'Snowflake', reference: 'SBGA211', purchasePrice: 5300, productionYear: 2022, condition: 'neuf', hasPapers: true, hasBox: true },
];
for (const [i, dto] of SEED.entries()) {
  res = await fetch(`${API}/watches`, { method: 'POST', headers, body: JSON.stringify(dto) });
  expect(res.status === 201, `montre ${i + 1}/7 « ${dto.brand} ${dto.model} » → 201 (reçu ${res.status})`);
}

// 3. Expiration → retour free
res = await fetch(`${API}/webhooks/revenuecat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
  body: JSON.stringify({ event: { type: 'EXPIRATION', app_user_id: userId } }),
});
const me = (await (await fetch(`${API}/me`, { headers })).json()).data;
expect(res.status === 200 && me?.plan === 'free', `webhook EXPIRATION → retour free (reçu ${me?.plan})`);

// 4. GET /watches : les 5 plus anciennes libres, les 2 plus récentes verrouillées
res = await fetch(`${API}/watches`, { headers });
const watches = (await res.json()).data as Array<{
  id: string; brand: string; model: string; createdAt: string; locked: boolean;
}>;
const byAge = [...watches].sort(
  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
);
const unlockedNames = byAge.filter((w) => !w.locked).map((w) => w.brand);
const lockedNames = byAge.filter((w) => w.locked).map((w) => `${w.brand} ${w.model}`);
expect(
  watches.length === 7 && byAge.slice(0, 5).every((w) => !w.locked) && byAge.slice(5).every((w) => w.locked),
  `5 plus anciennes libres, 2 plus récentes verrouillées (verrouillées : ${lockedNames.join(', ') || 'aucune'})`
);

// 5. Accès direct à une montre verrouillée → 403 PREMIUM_REQUIRED
const lockedId = byAge[6]?.id;
res = await fetch(`${API}/watches/${lockedId}`, { headers });
let body = await res.json();
expect(
  res.status === 403 && body.error?.code === 'PREMIUM_REQUIRED',
  `GET montre verrouillée → 403 PREMIUM_REQUIRED (reçu ${res.status} ${body.error?.code})`
);

// 6. PATCH verrouillé → 403 aussi
res = await fetch(`${API}/watches/${lockedId}`, {
  method: 'PATCH', headers, body: JSON.stringify({ notes: 'tentative' }),
});
body = await res.json();
expect(
  res.status === 403 && body.error?.code === 'PREMIUM_REQUIRED',
  `PATCH montre verrouillée → 403 PREMIUM_REQUIRED (reçu ${res.status} ${body.error?.code})`
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) en échec`);
  process.exit(1);
}
console.log(`\nTous les checks passent ✓
Compte de démo conservé pour l'app :
  e-mail    : ${EMAIL}
  mot de passe : ${PASSWORD}`);
process.exit(0);
