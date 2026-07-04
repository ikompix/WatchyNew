import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { watchModels } from './schema.js';
import { refreshModelPrice, marketResearchAvailable } from '../lib/market-research.js';

const STALE_DAYS = 7;
const THROTTLE_MS = 2000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!marketResearchAvailable()) {
    console.error('ANTHROPIC_API_KEY manquante — impossible de rechercher la cote.');
    process.exit(1);
  }

  const limit = Number(arg('--limit') ?? 10);
  const all = process.argv.includes('--all');

  // Modèles sans cote réelle fraîche (< STALE_DAYS jours), montres des utilisateurs en priorité
  const stale = await db
    .select({
      id: watchModels.id,
      canonicalName: watchModels.canonicalName,
      // NB: colonnes qualifiées à la main — `${watchModels.id}` serait rendu "id" non
      // qualifié et capturé par la table du sous-select (w.id), toujours faux.
      owned: sql<boolean>`EXISTS (SELECT 1 FROM watches w WHERE w.watch_model_id = watch_models.id)`,
    })
    .from(watchModels)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM market_prices p
        WHERE p.watch_model_id = watch_models.id
          AND p.source != 'seed'
          AND p.fetched_at > now() - make_interval(days => ${STALE_DAYS})
      )` // pas de cote réelle récente
    );

  const queue = stale
    .filter((m) => all || m.owned)
    .sort((a, b) => Number(b.owned) - Number(a.owned))
    .slice(0, limit);

  console.log(
    `${stale.length} modèle(s) sans cote fraîche — rafraîchissement de ${queue.length} (limit ${limit}${all ? ', --all' : ', montres utilisateurs seulement'})\n`
  );

  let ok = 0;
  for (const m of queue) {
    try {
      const done = await refreshModelPrice(m.id);
      if (done) ok++;
      else console.log(`— ${m.canonicalName}: pas de cote fiable`);
    } catch (err) {
      console.error(`✗ ${m.canonicalName}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  console.log(`\n${ok}/${queue.length} cote(s) mise(s) à jour.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
