import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { expertReports, watches, watchModels } from '../db/schema.js';
import { marketResearchAvailable } from './market-research.js';

const MODEL = 'claude-opus-4-8';

// Même approche que market-research : génération longue (~1-2 min, web search)
// lancée en tâche de fond, le mobile poll le GET jusqu'à disponibilité.
const inFlight = new Set<string>();

export function reportGenerating(watchId: string): boolean {
  return inFlight.has(watchId);
}

export function generateReportInBackground(watchId: string): void {
  if (!marketResearchAvailable() || inFlight.has(watchId)) return;
  inFlight.add(watchId);
  generateReport(watchId)
    .catch((err) => console.error(`[expert-report] ${watchId}:`, err))
    .finally(() => inFlight.delete(watchId));
}

let client: Anthropic | null = null;

async function generateReport(watchId: string): Promise<void> {
  const [watch] = await db.select().from(watches).where(eq(watches.id, watchId));
  if (!watch) return;
  client ??= new Anthropic();

  // Le surnom du modèle (« Batman »…) précise la référence pour la recherche web
  let nickname: string | null = null;
  if (watch.watchModelId) {
    const [model] = await db
      .select({ nickname: watchModels.nickname })
      .from(watchModels)
      .where(eq(watchModels.id, watch.watchModelId));
    nickname = model?.nickname ?? null;
  }
  const base = [watch.brand, watch.model, watch.reference].filter(Boolean).join(' ');
  const label = nickname ? `${base} « ${nickname} »` : base;
  const details = [
    watch.dialColor ? `cadran ${watch.dialColor}` : null,
    watch.productionYear ? `année ${watch.productionYear}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const startedAt = Date.now();

  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Tu es un expert horloger indépendant. Rédige en français, en markdown, un rapport d'expert sur cette montre : ${label}${details ? ` (${details})` : ''}.

Structure exacte :
## Histoire du modèle
## Points de contrôle d'authenticité
(les détails concrets à vérifier sur cet exemplaire : gravures, cadran, mouvement, numéros de série…)
## Ce qui fait la cote
(facteurs qui font monter ou baisser le prix de cette référence : variantes recherchées, années, état, full set…)
## Entretien
(intervalle de révision recommandé, coût typique, pièges à éviter)

Cherche sur le web si nécessaire pour être factuel et à jour. 400 à 600 mots, ton précis et concret, pas de disclaimer. Commence directement par le premier titre ##.`,
    },
  ];

  const request = () =>
    client!.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
      messages,
    });

  let response = await request();
  // Les outils serveur peuvent suspendre le tour — on relance jusqu'à complétion
  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < 5) {
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await request();
    continuations++;
  }

  const content = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!content) {
    console.warn(`[expert-report] ${label}: réponse vide (${Date.now() - startedAt}ms)`);
    return;
  }

  await db
    .insert(expertReports)
    .values({ watchId, content, model: MODEL, createdAt: new Date() })
    .onConflictDoUpdate({
      target: expertReports.watchId,
      set: { content, model: MODEL, createdAt: new Date() },
    });
  console.log(`[expert-report] ${label}: généré en ${Date.now() - startedAt}ms`);
}
