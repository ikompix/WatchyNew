import { Hono } from 'hono';
import { ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { watchModels } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ApiResponse } from '@watchy/types';
import type { WatchModel } from '@watchy/types';

const router = new Hono<{ Variables: { userId: string } }>();

router.use('*', authMiddleware);

router.get('/', async (c) => {
  const q = c.req.query('q');

  let rows = q
    ? await db
        .select()
        .from(watchModels)
        .where(
          or(
            ilike(watchModels.brand, `%${q}%`),
            ilike(watchModels.model, `%${q}%`),
            ilike(watchModels.reference, `%${q}%`),
            ilike(watchModels.canonicalName, `%${q}%`),
            // Les collectionneurs cherchent par surnom (« Batman », « Hulk »…)
            ilike(watchModels.nickname, `%${q}%`)
          )
        )
        .limit(20)
    : await db.select().from(watchModels).limit(20);

  // Aucun résultat exact → recherche floue trigram (tolère les fautes, ex. "Oyester").
  // strict_word_similarity classe mieux les fautes de frappe que word_similarity
  // (pénalise les correspondances en milieu de mot type "Jazzmaster").
  if (q && rows.length === 0) {
    // Le surnom rejoint le texte comparé pour tolérer « betman » → Batman
    const haystack = sql`${watchModels.canonicalName} || ' ' || coalesce(${watchModels.nickname}, '')`;
    rows = await db
      .select()
      .from(watchModels)
      .where(sql`strict_word_similarity(${q}, ${haystack}) > 0.35`)
      .orderBy(sql`strict_word_similarity(${q}, ${haystack}) DESC`)
      .limit(10);
  }

  return c.json<ApiResponse<WatchModel[]>>({
    data: rows as unknown as WatchModel[],
    error: null,
  });
});

export { router as watchModelsRouter };
