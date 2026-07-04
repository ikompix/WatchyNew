export interface WatchModel {
  id: string;
  brand: string;
  model: string;
  reference: string | null;
  canonicalName: string;
  photoUrl: string | null;
  /** Surnom de collectionneurs de la référence (« Batman », « Hulk »…) */
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

export const WATCH_CONDITIONS = ['neuf', 'tres_bon', 'bon', 'use'] as const;
export type WatchCondition = (typeof WATCH_CONDITIONS)[number];

export const CONDITION_LABELS: Record<WatchCondition, string> = {
  neuf: 'Neuf',
  tres_bon: 'Très bon',
  bon: 'Bon',
  use: 'Usé',
};

export interface Watch {
  id: string;
  userId: string;
  watchModelId: string | null;
  brand: string;
  model: string;
  reference: string | null;
  photoUrl: string | null;
  /** Couleur du cadran — critère de prix majeur à référence identique */
  dialColor: string | null;
  productionYear: number | null;
  condition: WatchCondition | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  hasPapers: boolean;
  hasBox: boolean;
  notes: string | null;
  completionPct: number;
  createdAt: string;
  updatedAt: string;
}

export type WatchCompletionField =
  | 'photoUrl'
  | 'reference'
  | 'purchasePrice'
  | 'purchaseDate'
  | 'hasPapers'
  | 'hasBox'
  | 'dialColor'
  | 'productionYear'
  | 'condition';

export const COMPLETION_WEIGHTS: Record<WatchCompletionField, number> = {
  photoUrl: 15,
  reference: 15,
  purchasePrice: 15,
  purchaseDate: 10,
  hasPapers: 10,
  hasBox: 10,
  dialColor: 10,
  productionYear: 10,
  condition: 5,
} as const;

export function computeCompletionPct(watch: Partial<Pick<Watch, WatchCompletionField>>): number {
  let total = 0;
  if (watch.photoUrl) total += COMPLETION_WEIGHTS.photoUrl;
  if (watch.reference) total += COMPLETION_WEIGHTS.reference;
  if (watch.purchasePrice != null) total += COMPLETION_WEIGHTS.purchasePrice;
  if (watch.purchaseDate) total += COMPLETION_WEIGHTS.purchaseDate;
  if (watch.hasPapers) total += COMPLETION_WEIGHTS.hasPapers;
  if (watch.hasBox) total += COMPLETION_WEIGHTS.hasBox;
  if (watch.dialColor) total += COMPLETION_WEIGHTS.dialColor;
  if (watch.productionYear != null) total += COMPLETION_WEIGHTS.productionYear;
  if (watch.condition) total += COMPLETION_WEIGHTS.condition;
  return total;
}
