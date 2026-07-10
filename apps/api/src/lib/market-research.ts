import Anthropic from '@anthropic-ai/sdk';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { marketPrices, watches, watchModels } from '../db/schema.js';
import { UsageTracker } from './ai-usage.js';

// Libellés internes aux prompts (jamais affichés à l'utilisateur) — ils
// restent en français quelle que soit la langue de l'app : la sortie du
// modèle est purement numérique.
const CONDITION_LABELS: Record<string, string> = {
  neuf: 'neuf (jamais porté)',
  tres_bon: 'très bon état',
  bon: 'bon état',
  use: 'état usé',
};

export type VariantAttrs = {
  dialColor?: string | null;
  productionYear?: number | null;
  condition?: string | null;
};

function describeVariant(attrs: VariantAttrs): string | null {
  const parts: string[] = [];
  if (attrs.dialColor) parts.push(`cadran ${attrs.dialColor}`);
  if (attrs.productionYear != null) parts.push(`année ${attrs.productionYear}`);
  if (attrs.condition && CONDITION_LABELS[attrs.condition])
    parts.push(CONDITION_LABELS[attrs.condition]);
  return parts.length > 0 ? parts.join(', ') : null;
}

const marketSchema = z.object({
  found: z.boolean(),
  priceEur: z.number().positive().nullable(),
  fullSetPriceEur: z.number().positive().nullable(),
  rangeLowEur: z.number().positive().nullable(),
  rangeHighEur: z.number().positive().nullable(),
  priceSixMonthsAgoEur: z.number().positive().nullable(),
  sources: z.array(z.string()),
});

export type MarketResearch = z.infer<typeof marketSchema>;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    found: {
      type: 'boolean',
      description: 'true si une cote de marché fiable a pu être établie',
    },
    priceEur: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: "Cote actuelle médiane du marché de l'occasion en EUR (montre seule, bon état)",
    },
    fullSetPriceEur: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description:
        'Cote médiane en EUR pour un exemplaire "full set" (avec boîte et papiers d\'origine). Si les sources ne distinguent pas, estimer avec la prime full set habituelle du marché pour cette marque/gamme.',
    },
    rangeLowEur: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Bas de la fourchette observée en EUR',
    },
    rangeHighEur: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Haut de la fourchette observée en EUR',
    },
    priceSixMonthsAgoEur: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Estimation de la cote il y a ~6 mois en EUR si les sources le permettent, sinon null',
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'Domaines des sources utilisées (ex. "chrono24.fr", "watchcharts.com")',
    },
  },
  required: ['found', 'priceEur', 'fullSetPriceEur', 'rangeLowEur', 'rangeHighEur', 'priceSixMonthsAgoEur', 'sources'],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

export function marketResearchAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function researchMarketPrice(
  model: {
    brand: string;
    model: string;
    reference: string | null;
    nickname?: string | null;
  },
  attrs?: VariantAttrs
): Promise<MarketResearch | null> {
  if (!marketResearchAvailable()) return null;
  client ??= new Anthropic();

  // Le surnom (« Batman », « Hulk »…) affine fortement la recherche : il
  // désigne cette référence précise dans les annonces et les cotes publiées
  const base = [model.brand, model.model, model.reference].filter(Boolean).join(' ');
  const label = model.nickname ? `${base} « ${model.nickname} »` : base;
  const variant = attrs ? describeVariant(attrs) : null;
  const startedAt = Date.now();

  const variantClause = variant
    ? `\nAttention : il s'agit précisément de la variante « ${variant} ». À référence identique, la couleur du cadran, l'année et l'état peuvent fortement changer le prix (certains cadrans sont très recherchés) — cote CETTE variante, pas la référence en général. L'état indiqué remplace l'hypothèse « bon état » par défaut.`
    : '';

  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Quelle est la cote actuelle sur le marché de l'occasion (en euros) de la montre suivante : ${label} ?${variantClause}
Cherche les annonces et données de cote publiques récentes (Chrono24, WatchCharts, ventes récentes). Donne :
- la médiane pour une montre seule${variant ? '' : ' en bon état'} (boîte/papiers non requis),
- la médiane pour un exemplaire full set (boîte + papiers d'origine) — les annonces full set sont généralement plus chères ; si les sources ne distinguent pas, applique la prime full set habituelle pour cette marque/gamme,
- une fourchette basse/haute,
- si possible une estimation de la cote il y a 6 mois.
Si le modèle est introuvable ou trop rare pour une cote fiable, indique found=false.`,
    },
  ];

  const usage = new UsageTracker(`cote ${label}`, 'claude-sonnet-4-6');
  // cache_control top-level : chaque tour met le préfixe en cache, les
  // continuations pause_turn relisent les résultats de recherche à 0,1× au
  // lieu de repayer tout le contexte plein tarif. Pas de thinking : extraction
  // de prix structurée, le raisonnement long n'apporte pas assez pour son coût.
  const request = () =>
    client!.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      cache_control: { type: 'ephemeral' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages,
    });

  let response = await request();
  usage.add(response.usage);
  // Reprise pause_turn plafonnée — chaque tour supplémentaire coûte
  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < 2) {
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await request();
    usage.add(response.usage);
    continuations++;
  }
  usage.log();

  if (response.stop_reason === 'refusal') {
    console.warn(`[market] ${label}: refused (${Date.now() - startedAt}ms)`);
    return null;
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) return null;

  const parsed = marketSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.warn(`[market] ${label}: sortie invalide (${Date.now() - startedAt}ms)`);
    return null;
  }
  console.log(
    `[market] ${label}${variant ? ` (${variant})` : ''}: ${parsed.data.found ? `${parsed.data.priceEur}€ [${parsed.data.rangeLowEur}–${parsed.data.rangeHighEur}]` : 'introuvable'} en ${Date.now() - startedAt}ms via ${parsed.data.sources.join(', ') || '—'}`
  );
  return parsed.data;
}

// Verrou anti-rafale : un seul refresh en vol par cible (process-wide)
const inFlight = new Set<string>();

/** Lance refreshModelPrice en tâche de fond, sans doublon ni exception non gérée. */
export function refreshInBackground(watchModelId: string): void {
  const key = `model:${watchModelId}`;
  if (!marketResearchAvailable() || inFlight.has(key)) return;
  inFlight.add(key);
  refreshModelPrice(watchModelId)
    .catch((err) => console.error(`[market] refresh ${watchModelId}:`, err))
    .finally(() => inFlight.delete(key));
}

/** Idem pour la cote de variante d'une montre précise. */
export function refreshWatchInBackground(watchId: string): void {
  const key = `watch:${watchId}`;
  if (!marketResearchAvailable() || inFlight.has(key)) return;
  inFlight.add(key);
  refreshWatchPrice(watchId)
    .catch((err) => console.error(`[market] refresh montre ${watchId}:`, err))
    .finally(() => inFlight.delete(key));
}

/**
 * Cote de la variante d'une montre : si elle a des attributs différenciants
 * (couleur/année/état), recherche spécifique stockée avec watch_id ; sinon
 * délègue à la cote de base du modèle.
 */
export async function refreshWatchPrice(watchId: string): Promise<boolean> {
  const [watch] = await db.select().from(watches).where(eq(watches.id, watchId));
  if (!watch?.watchModelId) return false;

  const attrs: VariantAttrs = {
    dialColor: watch.dialColor,
    productionYear: watch.productionYear,
    condition: watch.condition,
  };
  if (!describeVariant(attrs)) return refreshModelPrice(watch.watchModelId);

  const [model] = await db
    .select()
    .from(watchModels)
    .where(eq(watchModels.id, watch.watchModelId));
  if (!model) return false;

  // Le surnom porté par la montre prime (reco IA, saisie) sur celui du catalogue
  const research = await researchMarketPrice(
    { ...model, nickname: watch.nickname ?? model.nickname },
    attrs
  );
  if (!research?.found || research.priceEur == null) return false;

  const source = `web:${research.sources.slice(0, 2).join(',') || 'recherche'}`.slice(0, 120);
  const rows: (typeof marketPrices.$inferInsert)[] = [];
  if (research.priceSixMonthsAgoEur != null) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    // Pas de suffixe texte : le point rétrodaté se reconnaît à son fetchedAt,
    // et `source` reste neutre en langue (affiché tel quel côté mobile)
    rows.push({
      watchModelId: watch.watchModelId,
      watchId,
      price: research.priceSixMonthsAgoEur.toFixed(2),
      currency: 'EUR',
      source,
      fetchedAt: sixMonthsAgo,
    });
  }
  rows.push({
    watchModelId: watch.watchModelId,
    watchId,
    price: research.priceEur.toFixed(2),
    fullSetPrice: research.fullSetPriceEur?.toFixed(2),
    currency: 'EUR',
    source,
    fetchedAt: new Date(),
  });

  // Remplace l'ancienne cote de variante (les attributs ont pu changer)
  await db.delete(marketPrices).where(eq(marketPrices.watchId, watchId));
  await db.insert(marketPrices).values(rows);
  return true;
}

/**
 * Recherche la cote d'un modèle et l'enregistre dans market_prices.
 * Au premier point réel, purge les points 'seed' du modèle (cotes d'amorçage inventées).
 * Retourne true si une cote a été enregistrée.
 */
export async function refreshModelPrice(watchModelId: string): Promise<boolean> {
  const [model] = await db.select().from(watchModels).where(eq(watchModels.id, watchModelId));
  if (!model) return false;

  const research = await researchMarketPrice(model);
  if (!research?.found || research.priceEur == null) return false;

  const source = `web:${research.sources.slice(0, 2).join(',') || 'recherche'}`.slice(0, 120);
  const rows: (typeof marketPrices.$inferInsert)[] = [];

  if (research.priceSixMonthsAgoEur != null) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    // Point rétrodaté identifiable par fetchedAt — `source` reste neutre en langue
    rows.push({
      watchModelId,
      price: research.priceSixMonthsAgoEur.toFixed(2),
      currency: 'EUR',
      source,
      fetchedAt: sixMonthsAgo,
    });
  }
  rows.push({
    watchModelId,
    price: research.priceEur.toFixed(2),
    fullSetPrice: research.fullSetPriceEur?.toFixed(2),
    currency: 'EUR',
    source,
    fetchedAt: new Date(),
  });

  await db.insert(marketPrices).values(rows);
  await db
    .delete(marketPrices)
    .where(and(eq(marketPrices.watchModelId, watchModelId), eq(marketPrices.source, 'seed')));
  return true;
}
