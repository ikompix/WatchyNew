// Surnoms de collectionneurs pour les références iconiques — zéro token IA.
//   pnpm catalog:nicknames
// Idempotent : ne touche que les modèles sans nickname. L'IA (catalog:enrich)
// complète le reste du catalogue.
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { db } from './index.js';
import { watchModels } from './schema.js';

// référence exacte → surnom établi (le surnom désigne LA référence, pas la gamme)
const NICKNAMES: Record<string, string> = {
  // Rolex GMT-Master II
  '126710BLNR': 'Batman',
  '116710BLNR': 'Batman',
  '126710BLRO': 'Pepsi',
  '16710': 'Pepsi',
  '126711CHNR': 'Root Beer',
  '126715CHNR': 'Root Beer',
  '126720VTNR': 'Sprite',
  // Rolex Submariner
  '116610LV': 'Hulk',
  '16610LV': 'Kermit',
  '126610LV': 'Starbucks',
  '116619LB': 'Smurf',
  '126619LB': 'Cookie Monster',
  // Rolex Daytona
  '116500LN': 'Panda',
  '116508': 'John Mayer',
  // Rolex Explorer II — 16570/226570 exclus : « Polar » ne vaut que pour le
  // cadran blanc, or la référence couvre aussi le noir
  '1655': 'Freccione',
  // Omega Speedmaster
  '310.30.42.50.01.001': 'Moonwatch',
  '311.30.42.30.01.005': 'Moonwatch',
  '310.32.42.50.02.001': 'Snoopy',
  // Audemars Piguet / Patek — gammes iconiques sans surnom de réf : rien (ne pas inventer)
  // Tudor Black Bay
  'M79830RB-0001': 'Pepsi',
  'M7939G1A0NRU-0001': 'Coke',
};

let updated = 0;
for (const [reference, nickname] of Object.entries(NICKNAMES)) {
  const rows = await db
    .update(watchModels)
    .set({ nickname, updatedAt: new Date() })
    .where(and(ilike(watchModels.reference, reference), isNull(watchModels.nickname)))
    .returning({ id: watchModels.id, canonicalName: watchModels.canonicalName });
  for (const row of rows) {
    console.log(`✓ ${row.canonicalName} → « ${nickname} »`);
    updated++;
  }
}

const [count] = await db
  .select({ n: watchModels.id })
  .from(watchModels)
  .where(eq(watchModels.nickname, 'Batman'))
  .limit(1);
console.log(`\n${updated} surnom(s) posé(s)${count ? '' : ' (aucune GMT Batman au catalogue)'}`);
process.exit(0);
