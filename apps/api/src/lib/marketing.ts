import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { UsageTracker } from './ai-usage.js';

// Génération de posts marketing pour /admin/marketing — la publication reste
// 100 % manuelle (relecture, édition puis copier-coller depuis le BO).

export const MARKETING_CHANNELS = ['instagram', 'twitter', 'reddit'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  instagram: 'Instagram',
  twitter: 'X / Twitter',
  reddit: 'Reddit',
};

export const MARKETING_TOPICS = {
  product_news: 'Nouveauté produit',
  watch_education: 'Éducation horlogère',
  community: 'Engagement communauté',
  behind_the_scenes: 'Coulisses / making-of',
} as const;
export type MarketingTopic = keyof typeof MARKETING_TOPICS;

export const MARKETING_LOCALES = ['fr', 'en'] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];

const postSchema = z.object({
  title: z.string().nullable(),
  content: z.string().min(1),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Titre du post (Reddit uniquement, < 300 caractères) — null pour Instagram et X/Twitter',
    },
    content: {
      type: 'string',
      description: 'Corps du post, prêt à publier tel quel',
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
} as const;

// Ton de marque partagé par tous les canaux — aligné sur le positionnement
// produit : utile d'abord, jamais de vente agressive
const BRAND_BRIEF = `Tu rédiges pour Watchy, une application mobile (iOS) de passionnés de montres :
reconnaissance d'une montre à partir d'une photo (IA), suivi de sa collection et de la cote
de ses montres sur le marché de l'occasion, wishlist, coffre-fort pour les papiers.
Publics : collectionneurs sérieux ET curieux grand public qui découvrent l'horlogerie.
Ton : passionné, précis, accessible — comme un ami collectionneur qui partage une trouvaille.
Interdits : superlatifs publicitaires (« révolutionnaire », « incontournable »), pression à
l'achat, mention des prix/abonnements, rafales d'emojis (un ou deux maximum, ou aucun).
Le produit se mentionne naturellement, jamais en pitch commercial.`;

const CHANNEL_RULES: Record<MarketingChannel, string> = {
  twitter: `Canal : X/Twitter. 280 caractères MAXIMUM (compte-les). Pas de hashtag, ou un seul
très pertinent. Une seule idée par post, percutante. title = null.`,
  instagram: `Canal : Instagram (caption). 3 à 6 lignes aérées, une accroche en première ligne
(c'est la seule visible avant « plus »), puis 5 à 8 hashtags horlogers pertinents sur la
dernière ligne (mélange gros volumes type #watchesofinstagram et niches). title = null.`,
  reddit: `Canal : Reddit (r/Watches, r/watchcollecting ou équivalent). title obligatoire
(< 300 caractères), factuel et non putaclic. Corps conversationnel, à la première personne,
avec transparence : tu es le développeur de Watchy et tu le dis clairement (règles
anti-self-promo des subreddits). Apporte de la valeur d'abord (retour d'expérience, question
à la communauté, apprentissage) ; aucun lien, aucun appel au téléchargement insistant.`,
};

let client: Anthropic | null = null;

export function marketingAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateMarketingPost(opts: {
  channel: MarketingChannel;
  topic: MarketingTopic;
  locale: MarketingLocale;
  brief?: string;
}): Promise<{ title: string | null; content: string } | null> {
  if (!marketingAvailable()) return null;
  client ??= new Anthropic();
  const startedAt = Date.now();

  const language = opts.locale === 'fr' ? 'français' : 'anglais';
  const prompt = `${BRAND_BRIEF}

${CHANNEL_RULES[opts.channel]}

Thème du post : ${MARKETING_TOPICS[opts.topic]}.
Langue : ${language}.${opts.brief ? `\nConsigne particulière : ${opts.brief}` : ''}

Rédige UN post prêt à publier.`;

  const usage = new UsageTracker(`marketing ${opts.channel}/${opts.topic}`, 'claude-opus-4-8');
  // Rédaction courte : pas de web_search ni de thinking, un seul tour suffit
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  usage.add(response.usage);
  usage.log();

  if (response.stop_reason === 'refusal') {
    console.warn(`[marketing] ${opts.channel}/${opts.topic}: refused (${Date.now() - startedAt}ms)`);
    return null;
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) return null;

  const parsed = postSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.warn(`[marketing] ${opts.channel}/${opts.topic}: sortie invalide (${Date.now() - startedAt}ms)`);
    return null;
  }
  console.log(
    `[marketing] ${opts.channel}/${opts.topic} (${opts.locale}): ${parsed.data.content.length} car. en ${Date.now() - startedAt}ms`
  );
  return parsed.data;
}
