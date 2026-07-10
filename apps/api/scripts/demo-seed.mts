// Compte démo pour la review App Store et les screenshots — idempotent :
// supprime et recrée le compte demo@watchy-app.com avec une collection seedée.
//   npx tsx --env-file=.env scripts/demo-seed.mts
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { entitlements, watches, wishlistItems } from '../src/db/schema.js';
import { computeCompletionPct } from '@watchy/types';

const rt = { realtime: { transport: ws as unknown as typeof WebSocket } };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, rt);

const EMAIL = 'demo@watchy-app.com';
const PASSWORD = 'WatchyDemo2026!';
// Photo réelle (Aqua Terra) copiée depuis le compte de Tom vers le dossier du démo
const SOURCE_PHOTO =
  'https://ahjbfjrauwarxlvzwcnq.supabase.co/storage/v1/object/public/watch-photos/ba6e3014-987b-482a-8a5b-5ab5cb2897b8/64bf44d3-27d6-4796-b4b7-94ff60f34019.jpg';

// Recrée le user pour repartir d'un état propre
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existing = list?.users.find((u) => u.email === EMAIL);
if (existing) {
  await db.delete(watches).where(eq(watches.userId, existing.id));
  await db.delete(wishlistItems).where(eq(wishlistItems.userId, existing.id));
  await db.delete(entitlements).where(eq(entitlements.userId, existing.id));
  await admin.auth.admin.deleteUser(existing.id);
  console.log('ancien compte démo supprimé');
}

const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (error) throw error;
const userId = created.user.id;
console.log(`compte démo créé: ${EMAIL} (${userId})`);

// Copie de la photo dans le dossier du démo (le bucket est public)
const photoBytes = Buffer.from(await (await fetch(SOURCE_PHOTO)).arrayBuffer());
const photoPath = `${userId}/demo-aqua-terra.jpg`;
const { error: upErr } = await admin.storage
  .from('watch-photos')
  .upload(photoPath, photoBytes, { contentType: 'image/jpeg', upsert: true });
if (upErr) throw upErr;
const photoUrl = admin.storage.from('watch-photos').getPublicUrl(photoPath).data.publicUrl;

const DEMO_WATCHES = [
  {
    watchModelId: '5a7b17e1-2b2a-453d-bc66-3660a0cdd838', // GMT-Master II Batman (cote ~15,9 k€)
    brand: 'Rolex',
    model: 'GMT-Master II',
    reference: '126710BLNR',
    dialColor: 'Noir',
    productionYear: 2022,
    condition: 'tres_bon',
    purchasePrice: '13500.00',
    purchaseDate: '2023-04-15',
    hasPapers: true,
    hasBox: true,
    photoUrl: null as string | null,
  },
  {
    watchModelId: 'f1ef050b-fbe3-492f-8499-95bdf394472e', // Aqua Terra 150M — avec photo
    brand: 'Omega',
    model: 'Seamaster Aqua Terra 150M Co-Axial Master Chronometer',
    reference: '220.10.41.21.03.001',
    dialColor: 'Bleu',
    productionYear: 2024,
    condition: 'neuf',
    purchasePrice: '5700.00',
    purchaseDate: '2025-01-20',
    hasPapers: true,
    hasBox: true,
    photoUrl,
  },
  {
    watchModelId: 'fd915ef3-f95c-4649-b387-55121f60e824', // Black Bay 58 (cote ~3,1 k€)
    brand: 'Tudor',
    model: 'Black Bay 58',
    reference: '79030N',
    dialColor: 'Noir',
    productionYear: 2021,
    condition: 'bon',
    purchasePrice: '2850.00',
    purchaseDate: '2022-09-03',
    hasPapers: false,
    hasBox: true,
    photoUrl: null as string | null,
  },
];

for (const w of DEMO_WATCHES) {
  const completionPct = computeCompletionPct({
    photoUrl: w.photoUrl,
    reference: w.reference,
    dialColor: w.dialColor,
    productionYear: w.productionYear,
    condition: w.condition as 'neuf' | 'tres_bon' | 'bon' | 'use',
    purchasePrice: Number(w.purchasePrice),
    purchaseDate: w.purchaseDate,
    hasPapers: w.hasPapers,
    hasBox: w.hasBox,
  });
  await db.insert(watches).values({ userId, ...w, completionPct });
  console.log(`montre: ${w.brand} ${w.model} (complétion ${completionPct}%)`);
}

await db.insert(wishlistItems).values([
  { userId, watchModelId: '9d81e08f-96b2-4ecb-989f-31d13efa2df8' }, // GMT Pepsi
  { userId, watchModelId: 'e45bb756-2142-4b75-a7ca-dd314dfc7e55' }, // Nautilus
]);
console.log('wishlist: Pepsi + Nautilus');

// Premium promo (testeurs/review) — pas d'expiration, aucun paiement
await db.insert(entitlements).values({ userId, plan: 'premium', source: 'promo' });
console.log('premium promo activé');

console.log(`\nCompte démo prêt — ${EMAIL} / ${PASSWORD}`);
process.exit(0);
