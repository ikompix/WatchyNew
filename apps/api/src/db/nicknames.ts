// Surnoms de collectionneurs pour les références iconiques — zéro token IA.
//   pnpm catalog:nicknames
// Idempotent : ne touche que les modèles sans nickname. L'IA (catalog:enrich)
// complète le reste du catalogue.
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { db } from './index.js';
import { watchModels } from './schema.js';
import { NICKNAMES } from '../lib/nickname-map.js';

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
