// Backfill de l'enrichissement des modèles (photo + surnom, un appel IA/modèle).
//   pnpm catalog:enrich --limit 10 [--all]
// Par défaut : uniquement les modèles présents dans une wishlist ou une
// collection (les plus visibles) ; --all balaie tout le catalogue.
// Cible les modèles jamais tentés (enriched_at null) — cache négatif respecté.
import { inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index.js';
import { watches, watchModels, wishlistItems } from './schema.js';
import { enrichModel } from '../lib/model-photo.js';
import { marketResearchAvailable } from '../lib/market-research.js';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
const all = args.includes('--all');

if (!marketResearchAvailable()) {
  console.error('ANTHROPIC_API_KEY manquante — impossible de lancer l\'enrichissement.');
  process.exit(1);
}

let candidates: { id: string; canonicalName: string }[];
if (all) {
  candidates = await db
    .select({ id: watchModels.id, canonicalName: watchModels.canonicalName })
    .from(watchModels)
    .where(isNull(watchModels.enrichedAt))
    .limit(limit);
} else {
  // Modèles jamais enrichis référencés par au moins un utilisateur
  const usedModelIds = await db
    .selectDistinct({ id: sql<string>`model_id` })
    .from(
      sql`(select watch_model_id as model_id from ${watches} where watch_model_id is not null
           union select watch_model_id from ${wishlistItems}) as used`
    );
  const ids = usedModelIds.map((r) => r.id);
  candidates = ids.length
    ? await db
        .select({ id: watchModels.id, canonicalName: watchModels.canonicalName })
        .from(watchModels)
        .where(sql`${isNull(watchModels.enrichedAt)} and ${inArray(watchModels.id, ids)}`)
        .limit(limit)
    : [];
}

console.log(`${candidates.length} modèle(s) à enrichir (limit ${limit}${all ? ', --all' : ''})`);
let ok = 0;
for (const model of candidates) {
  process.stdout.write(`→ ${model.canonicalName}… `);
  try {
    const result = await enrichModel(model.id);
    console.log(result);
    if (result === 'done') ok++;
  } catch (err) {
    console.log(`erreur: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`\n${ok}/${candidates.length} modèles enrichis`);
process.exit(0);
