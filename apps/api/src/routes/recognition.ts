import { Hono } from 'hono';
import { ilike, or, and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { recognitionEvents, watchModels } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { countScansThisMonth, FREE_SCANS_PER_MONTH, getPlan } from '../lib/entitlements.js';
import { sniffImageMime, uploadWatchPhoto } from '../lib/storage.js';
import { identifyWatch } from '../lib/recognition.js';
import { refreshInBackground } from '../lib/market-research.js';
import { enrichModelInBackground } from '../lib/model-photo.js';
import type { ApiResponse, RecognizeWatchResult, WatchModel } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

const recognizeSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

async function findCatalogMatches(identification: {
  brand: string | null;
  model: string | null;
  reference: string | null;
}): Promise<WatchModel[]> {
  const { brand, model, reference } = identification;

  // Exact-ish reference match first — it's the strongest signal
  if (reference) {
    const byReference = await db
      .select()
      .from(watchModels)
      .where(ilike(watchModels.reference, reference))
      .limit(5);
    if (byReference.length > 0) return byReference as unknown as WatchModel[];
  }

  if (brand && model) {
    const byName = await db
      .select()
      .from(watchModels)
      .where(and(ilike(watchModels.brand, `%${brand}%`), ilike(watchModels.model, `%${model}%`)))
      .limit(5);
    if (byName.length > 0) return byName as unknown as WatchModel[];
  }

  if (brand) {
    return (await db
      .select()
      .from(watchModels)
      .where(or(ilike(watchModels.brand, `%${brand}%`), ilike(watchModels.canonicalName, `%${brand}%`)))
      .limit(5)) as unknown as WatchModel[];
  }

  return [];
}

router.post('/', async (c) => {
  const userId = c.get('userId');
  const parsed = recognizeSchema.safeParse(await c.req.json());

  if (!parsed.success) {
    return c.json<ApiResponse<never>>(
      { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400
    );
  }

  // Plan free : 5 reconnaissances/mois — bloqué avant tout upload,
  // chaque scan coûte un appel Anthropic
  if (
    (await getPlan(userId)) === 'free' &&
    (await countScansThisMonth(userId)) >= FREE_SCANS_PER_MONTH
  ) {
    return c.json<ApiResponse<never>>(
      {
        data: null,
        error: {
          code: 'SCAN_QUOTA_EXCEEDED',
          message: `Limite de ${FREE_SCANS_PER_MONTH} reconnaissances par mois atteinte — passez à Premium pour scanner sans limite.`,
        },
      },
      403
    );
  }

  const { imageBase64 } = parsed.data;
  // Format réel depuis les octets — le mimeType déclaré par le client peut mentir
  const mimeType = sniffImageMime(Buffer.from(imageBase64, 'base64')) ?? parsed.data.mimeType;
  const photoUrl = await uploadWatchPhoto(userId, imageBase64, mimeType);

  let identification = null;
  try {
    // Le quota compte les tentatives réelles (l'appel IA est facturé même s'il échoue ensuite)
    await db.insert(recognitionEvents).values({ userId });
    identification = await identifyWatch(imageBase64, mimeType);
  } catch (err) {
    // Recognition is best-effort — the photo is already stored, the user falls back to manual entry
    console.error('Recognition failed:', err);
  }

  if (!identification || !identification.isWatch) {
    return c.json<ApiResponse<RecognizeWatchResult>>({
      data: {
        photoUrl,
        isWatch: identification?.isWatch ?? true,
        confidence: 0,
        brand: null,
        model: null,
        reference: null,
        dialColor: null,
        referenceCandidates: [],
        matched: null,
        alternatives: [],
      },
      error: null,
    });
  }

  const candidates = await findCatalogMatches(identification);
  let matched: WatchModel | null = candidates[0] ?? null;
  let alternatives = candidates.slice(1);

  // Référence lue ≠ référence du match (autre génération, cote différente) →
  // on ne rattache pas à tort, le match approximatif devient une alternative
  const refMismatch =
    matched?.reference &&
    identification.reference &&
    matched.reference.toLowerCase() !== identification.reference.toLowerCase();
  if (refMismatch) {
    alternatives = candidates.slice(0, 4);
    matched = null;
  }

  // Les variantes plausibles relevées par l'IA rejoignent les alternatives
  // si elles existent au catalogue (la référence fait le prix)
  for (const candidate of identification.referenceCandidates) {
    if (candidate.reference === identification.reference) continue;
    const [variant] = await db
      .select()
      .from(watchModels)
      .where(ilike(watchModels.reference, candidate.reference))
      .limit(1);
    if (variant) alternatives.push(variant as unknown as WatchModel);
  }
  const seen = new Set<string>(matched ? [matched.id] : []);
  alternatives = alternatives.filter((a) => !seen.has(a.id) && (seen.add(a.id), true)).slice(0, 4);

  // Identification confiante hors catalogue → le modèle exact rejoint le catalogue
  // (croissance organique) et sa cote part en recherche immédiatement
  if (!matched && identification.confidence >= 0.5 && identification.brand && identification.model) {
    const canonicalName = [identification.brand, identification.model, identification.reference]
      .filter(Boolean)
      .join(' ');
    const [created] = await db
      .insert(watchModels)
      .values({
        brand: identification.brand,
        model: identification.model,
        reference: identification.reference,
        canonicalName,
      })
      .returning();
    matched = created as unknown as WatchModel;
    console.log(`[recognition] catalogue enrichi: ${canonicalName}`);
    refreshInBackground(created.id);
    enrichModelInBackground(created.id);
  }

  return c.json<ApiResponse<RecognizeWatchResult>>({
    data: {
      photoUrl,
      isWatch: true,
      confidence: identification.confidence,
      brand: identification.brand,
      model: identification.model,
      reference: identification.reference,
      dialColor: identification.dialColor,
      referenceCandidates: identification.referenceCandidates,
      matched: matched ?? null,
      alternatives,
    },
    error: null,
  });
});

export { router as recognitionRouter };
