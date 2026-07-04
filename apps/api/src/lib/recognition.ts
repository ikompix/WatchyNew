import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const identificationSchema = z.object({
  isWatch: z.boolean(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  reference: z.string().nullable(),
  dialColor: z.string().nullable(),
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

const OUTPUT_SCHEMA = {
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
      description: 'Dial color as seen in the photo, in French, precise if possible (e.g. "vert menthe", "bleu soleillé", "noir mat"). Null if not clearly visible. The dial color strongly affects market value.',
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
            description: 'The visual cue that distinguishes this variant, in French (e.g. "pas de guichet date")',
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
  required: ['isWatch', 'brand', 'model', 'reference', 'dialColor', 'referenceCandidates', 'confidence'],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

export function recognitionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function identifyWatch(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<WatchIdentification | null> {
  if (!recognitionAvailable()) return null;
  client ??= new Anthropic();

  const startedAt = Date.now();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
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

For the reference: it is rarely printed on the watch, so infer it from visible cues — date window (present/absent, cyclops), bezel type and color, dial color and indices, case size relative to the wrist, bracelet style, material, generation details (lug holes, clasp). The reference determines market value, so be precise: if a single reference is clearly the best fit, give it; if 2-3 variants remain plausible (e.g. date vs no-date, current vs previous generation), give the most likely in "reference" AND list them in "referenceCandidates" with the visual cue (in French) that would let the owner confirm which one they have.

Be honest about your confidence: use a low value when the dial or case details are ambiguous.`,
          },
        ],
      },
    ],
  });

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
