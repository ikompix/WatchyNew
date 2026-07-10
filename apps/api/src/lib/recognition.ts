import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { UsageTracker } from './ai-usage.js';
import type { Locale } from './locale.js';

const identificationSchema = z.object({
  isWatch: z.boolean(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  reference: z.string().nullable(),
  dialColor: z.string().nullable(),
  nickname: z.string().nullable(),
  referenceCandidates: z.array(
    z.object({
      reference: z.string(),
      label: z.string(),
      cue: z.string(),
    })
  ),
  confidence: z.number().min(0).max(1),
});

export type WatchIdentification = z.infer<typeof identificationSchema>;

// Textes libres (couleur de cadran, indices visuels) produits dans la langue
// de l'utilisateur — le reste (marque, modèle, référence) est factuel.
const LANGUAGE_NAME: Record<Locale, string> = { fr: 'French', en: 'English' };

const outputSchema = (locale: Locale) => ({
  type: 'object',
  properties: {
    isWatch: {
      type: 'boolean',
      description: 'true if the image shows a wristwatch or pocket watch',
    },
    brand: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Watch brand as officially written (e.g. "Rolex", "TAG Heuer"), null if unknown',
    },
    model: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Model/collection name (e.g. "Submariner Date", "Speedmaster Professional"), null if unknown',
    },
    reference: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Most likely manufacturer reference (e.g. "126610LN") inferred from visible cues, null if you cannot narrow it down',
    },
    dialColor: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: `Dial color as seen in the photo, in ${LANGUAGE_NAME[locale]}, precise if possible (e.g. ${locale === 'fr' ? '"vert menthe", "bleu soleillé", "noir mat"' : '"mint green", "sunburst blue", "matte black"'}). Null if not clearly visible. The dial color strongly affects market value.`,
    },
    nickname: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'Widely established collector nickname for the EXACT identified reference (e.g. "Batman" for GMT-Master II 126710BLNR, "Hulk" for Submariner 116610LV, "Pepsi", "Panda"). Collectors identify watches by these nicknames, so it is highly valuable — but NEVER invent one: null unless the nickname is genuinely well-known for this precise reference.',
    },
    referenceCandidates: {
      type: 'array',
      description: 'Up to 3 plausible references when several variants remain possible (most likely first). Empty if the reference is certain or unknown.',
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Manufacturer reference (e.g. "124060")' },
          label: { type: 'string', description: 'Short variant name (e.g. "Submariner no-date 41mm")' },
          cue: {
            type: 'string',
            description: `The visual cue that distinguishes this variant, in ${LANGUAGE_NAME[locale]} (e.g. ${locale === 'fr' ? '"pas de guichet date"' : '"no date window"'})`,
          },
        },
        required: ['reference', 'label', 'cue'],
        additionalProperties: false,
      },
    },
    confidence: {
      type: 'number',
      description: 'Confidence in the brand+model identification, from 0 to 1',
    },
  },
  required: ['isWatch', 'brand', 'model', 'reference', 'dialColor', 'nickname', 'referenceCandidates', 'confidence'],
  additionalProperties: false,
});

let client: Anthropic | null = null;

export function recognitionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function identifyWatch(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  userId: string | null = null,
  locale: Locale = 'fr'
): Promise<WatchIdentification | null> {
  if (!recognitionAvailable()) return null;
  client ??= new Anthropic();

  const startedAt = Date.now();
  const usage = new UsageTracker('reco photo', 'claude-opus-4-8', userId);
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: outputSchema(locale) } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Identify the watch in this photo. Report the brand and model/collection name.

For the reference: it is rarely printed on the watch, so infer it from visible cues — date window (present/absent, cyclops), bezel type and color, dial color and indices, case size relative to the wrist, bracelet style, material, generation details (lug holes, clasp). The reference determines market value, so be precise: if a single reference is clearly the best fit, give it; if 2-3 variants remain plausible (e.g. date vs no-date, current vs previous generation), give the most likely in "reference" AND list them in "referenceCandidates" with the visual cue (in ${LANGUAGE_NAME[locale]}) that would let the owner confirm which one they have.

If the identified reference has a widely established collector nickname (Batman, Hulk, Pepsi, Panda…), report it — collectors identify watches this way. Never invent one.

Be honest about your confidence: use a low value when the dial or case details are ambiguous.`,
          },
        ],
      },
    ],
  });

  usage.add(response.usage);
  usage.log();

  if (response.stop_reason === 'refusal') {
    console.warn(`[recognition] refused after ${Date.now() - startedAt}ms`);
    return null;
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) return null;

  const parsed = identificationSchema.safeParse(JSON.parse(text));
  const result = parsed.success ? parsed.data : null;
  console.log(
    `[recognition] ${Date.now() - startedAt}ms — ${
      result
        ? `${result.brand ?? '?'} ${result.model ?? '?'} ${result.reference ?? ''} (conf ${result.confidence})`
        : 'unparseable output'
    }`
  );
  return result;
}
