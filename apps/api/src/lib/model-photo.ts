import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { watchModels } from '../db/schema.js';
import { marketResearchAvailable } from './market-research.js';
import { sniffImageMime, uploadModelPhoto } from './storage.js';

// Haiku suffit pour trouver une URL d'image et un surnom — coût minimal
const MODEL = 'claude-haiku-4-5-20251001';
// Plafond de recherches web par enrichissement (chaque recherche est facturée)
const MAX_WEB_SEARCHES = 2;
const MAX_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
// Cache négatif : un modèle enrichi (même sans résultat) n'est pas retenté avant ce délai
const RETRY_AFTER_DAYS = 30;

export type EnrichResult = 'done' | 'skipped' | 'not_found';

const enrichSchema = z.object({
  found: z.boolean(),
  imageUrls: z.array(z.string()),
  nickname: z.string().nullable(),
  sourceDomain: z.string().nullable(),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'true si au moins une photo produit exploitable a été trouvée' },
    imageUrls: {
      type: 'array',
      items: { type: 'string' },
      description:
        "URLs DIRECTES de fichiers image (finissant généralement par .jpg/.png/.webp ou servies par un CDN d'images), du meilleur au moins bon candidat, 5 max. Pas de pages HTML.",
    },
    nickname: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        "Surnom largement établi chez les collectionneurs pour CETTE référence précise (ex. « Batman », « Hulk », « Pepsi »). null si aucun surnom notoire — ne JAMAIS inventer.",
    },
    sourceDomain: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Domaine de la source principale (ex. "hodinkee.com")',
    },
  },
  required: ['found', 'imageUrls', 'nickname', 'sourceDomain'],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

/** Télécharge une candidate et valide que ce sont bien des octets d'image. */
async function downloadImage(url: string): Promise<{ buffer: Buffer; mime: ReturnType<typeof sniffImageMime> } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: {
        // Certains CDN refusent les clients non-navigateur ou le hotlinking
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
        Referer: new URL(url).origin,
      },
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    const buffer = Buffer.from(bytes);
    const mime = sniffImageMime(buffer);
    if (!mime) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

/**
 * Enrichissement d'un modèle en UN appel IA : photo produit (téléchargée puis
 * ré-hébergée dans le bucket — cache définitif) + surnom de collectionneurs.
 * `enrichedAt` est posé même en échec : cache négatif, on ne rejoue pas une
 * recherche web coûteuse avant RETRY_AFTER_DAYS.
 */
export async function enrichModel(watchModelId: string): Promise<EnrichResult> {
  const [model] = await db.select().from(watchModels).where(eq(watchModels.id, watchModelId));
  if (!model) return 'skipped';
  // Déjà tout, ou tentative récente (même infructueuse) → rien à faire
  const recentAttempt =
    model.enrichedAt != null &&
    Date.now() - model.enrichedAt.getTime() < RETRY_AFTER_DAYS * 24 * 3600 * 1000;
  if ((model.photoUrl && model.enrichedAt) || recentAttempt) return 'skipped';

  client ??= new Anthropic();
  const label = [model.brand, model.model, model.reference].filter(Boolean).join(' ');
  const startedAt = Date.now();

  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Renseigne la montre ${label} :
1. Une photo produit — montre seule vue de face, fond neutre/blanc, bonne résolution.
   IMPORTANT : je vais télécharger ces URLs avec un simple client HTTP. Privilégie les sources qui servent leurs images sans protection anti-hotlink : Wikimedia Commons, blogs et magazines horlogers (Hodinkee, Monochrome, Fratello…), watchbase.com. Évite chrono24 et les CDN des marques de luxe (rolex.com, omega.com) qui bloquent les téléchargements directs.
   Retourne jusqu'à 5 URLs DIRECTES de fichiers image (pas des pages web), de la plus fiable à la moins fiable. found=false si rien d'exploitable.
2. Le surnom de collectionneurs de CETTE référence précise s'il en existe un largement établi (ex. « Batman » pour la GMT-Master II 126710BLNR) — null sinon, n'invente jamais.`,
    },
  ];

  const request = () =>
    client!.messages.create({
      model: MODEL,
      max_tokens: 1000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_WEB_SEARCHES }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
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

  // Quoi qu'il arrive ensuite, la tentative est consommée (cache négatif)
  const attempt: Partial<typeof watchModels.$inferInsert> = {
    enrichedAt: new Date(),
    updatedAt: new Date(),
  };

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = text ? enrichSchema.safeParse(JSON.parse(text)) : null;
  if (!parsed?.success) {
    await db.update(watchModels).set(attempt).where(eq(watchModels.id, watchModelId));
    console.warn(`[enrich] ${label}: sortie inexploitable (${Date.now() - startedAt}ms)`);
    return 'not_found';
  }

  // Surnom : trouvé = stocké, sans écraser un surnom existant (seed manuel prioritaire)
  if (parsed.data.nickname && !model.nickname) {
    attempt.nickname = parsed.data.nickname;
  }

  let photoStored = false;
  if (parsed.data.found && !model.photoUrl) {
    for (const url of parsed.data.imageUrls.slice(0, 5)) {
      const image = await downloadImage(url);
      if (!image) continue;
      attempt.photoUrl = await uploadModelPhoto(watchModelId, image.buffer, image.mime!);
      photoStored = true;
      console.log(
        `[enrich] ${label}: photo ${(image.buffer.length / 1024).toFixed(0)} Ko via ${parsed.data.sourceDomain ?? new URL(url).hostname}`
      );
      break;
    }
  }

  await db.update(watchModels).set(attempt).where(eq(watchModels.id, watchModelId));
  console.log(
    `[enrich] ${label}: ${photoStored ? 'photo ok' : 'pas de photo'}${attempt.nickname ? `, surnom « ${attempt.nickname} »` : ''} en ${Date.now() - startedAt}ms`
  );
  return photoStored || attempt.nickname ? 'done' : 'not_found';
}

// Verrou anti-rafale, même pattern que market-research
const inFlight = new Set<string>();

/** Enrichissement en tâche de fond (no-op si déjà fait ou tentative récente). */
export function enrichModelInBackground(watchModelId: string): void {
  if (!marketResearchAvailable() || inFlight.has(watchModelId)) return;
  inFlight.add(watchModelId);
  enrichModel(watchModelId)
    .catch((err) => console.error(`[enrich] ${watchModelId}:`, err))
    .finally(() => inFlight.delete(watchModelId));
}
