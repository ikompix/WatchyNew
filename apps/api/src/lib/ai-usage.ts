import type Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { aiUsage } from '../db/schema.js';

// Grille $/MTok (input, output) — cache read = 0,1× input, cache write = 1,25×,
// recherche web = 0,01 $/recherche. À maintenir avec la grille Anthropic.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

/**
 * Cumule l'usage d'un appel IA (continuations pause_turn incluses) et logge
 * son coût estimé — chaque euro dépensé doit être visible dans les logs.
 */
export class UsageTracker {
  private input = 0;
  private output = 0;
  private cacheRead = 0;
  private cacheWrite = 0;
  private searches = 0;
  private turns = 0;

  constructor(
    private label: string,
    private model: string,
    // Rattache le coût à l'utilisateur déclencheur (null = job de fond)
    private userId: string | null = null
  ) {}

  add(usage: Anthropic.Usage | undefined): void {
    if (!usage) return;
    this.turns++;
    this.input += usage.input_tokens ?? 0;
    this.output += usage.output_tokens ?? 0;
    this.cacheRead += usage.cache_read_input_tokens ?? 0;
    this.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    this.searches += usage.server_tool_use?.web_search_requests ?? 0;
  }

  costUsd(): number {
    const p = PRICES[this.model] ?? PRICES['claude-opus-4-8'];
    return (
      (this.input * p.input +
        this.output * p.output +
        this.cacheRead * p.input * 0.1 +
        this.cacheWrite * p.input * 1.25) /
        1e6 +
      this.searches * 0.01
    );
  }

  log(): void {
    const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
    console.log(
      `[cost] ${this.label}: $${this.costUsd().toFixed(3)} — in ${k(this.input)} (cache r ${k(this.cacheRead)} / w ${k(this.cacheWrite)}), out ${k(this.output)}, ${this.searches} recherche(s), ${this.turns} tour(s)`
    );
    // Persistance pour le back office (/admin/costs) — jamais bloquant
    db.insert(aiUsage)
      .values({
        label: this.label,
        model: this.model,
        costUsd: this.costUsd().toFixed(4),
        inputTokens: this.input,
        outputTokens: this.output,
        cacheReadTokens: this.cacheRead,
        searches: this.searches,
        userId: this.userId,
      })
      .catch((err: unknown) =>
        console.warn('[cost] persistance échouée:', err instanceof Error ? err.message : err)
      );
  }
}
