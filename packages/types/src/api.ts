import type { WatchCondition, WatchModel } from './watch';

export interface CreateWatchDto {
  watchModelId?: string;
  brand: string;
  model: string;
  reference?: string;
  photoUrl?: string;
  dialColor?: string;
  productionYear?: number;
  condition?: WatchCondition;
  purchasePrice?: number;
  purchaseDate?: string;
  hasPapers?: boolean;
  hasBox?: boolean;
  notes?: string;
}

export type UpdateWatchDto = Partial<CreateWatchDto>;

export interface RecognizeWatchDto {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ReferenceCandidate {
  reference: string;
  label: string;
  /** L'indice visuel qui distingue cette variante (ex. "guichet date à 3h") */
  cue: string;
}

export interface RecognizeWatchResult {
  photoUrl: string;
  isWatch: boolean;
  confidence: number;
  brand: string | null;
  model: string | null;
  reference: string | null;
  /** Couleur du cadran vue sur la photo (français), null si incertain */
  dialColor: string | null;
  referenceCandidates: ReferenceCandidate[];
  matched: WatchModel | null;
  alternatives: WatchModel[];
}

export interface CollectionSummary {
  totalWatches: number;
  totalPurchaseValue: number | null;
  totalCurrentMarketValue: number | null;
  currency: string;
}

export type Plan = 'free' | 'premium';

export interface MeResult {
  plan: Plan;
  watchCount: number;
  /** null = illimité (premium) */
  watchLimit: number | null;
  scansUsed: number;
  scansLimit: number | null;
}

export interface PortfolioWatchValuation {
  watchId: string;
  /** Dernière cote connue (full set si papiers + boîte), null si aucune cote */
  currentValue: number | null;
  purchasePrice: number | null;
  gain: number | null;
}

export interface PortfolioPoint {
  date: string;
  value: number;
}

export interface PortfolioSummary {
  totalValue: number | null;
  totalPurchase: number | null;
  totalGain: number | null;
  /** Montres ayant une cote / total — la valeur totale ne couvre que les cotées */
  valuedWatches: number;
  totalWatches: number;
  currency: string;
  history: PortfolioPoint[];
  watches: PortfolioWatchValuation[];
}

export interface ExpertReport {
  watchId: string;
  content: string;
  model: string;
  createdAt: string;
}

export interface ExpertReportStatus {
  report: ExpertReport | null;
  /** true = génération en cours, le client repolle le GET */
  generating: boolean;
  /** true = la montre a été modifiée après la génération, rapport à rafraîchir */
  stale: boolean;
}

export interface WishlistItem {
  id: string;
  watchModelId: string;
  /** Non null = alerte de prix active (premium) */
  targetPrice: number | null;
  createdAt: string;
  model: WatchModel;
  /** Dernière cote de base connue du modèle */
  currentPrice: number | null;
  currency: string;
}

export interface AddWishlistItemDto {
  /** Modèle du catalogue… */
  watchModelId?: string;
  /** …ou saisie libre (le modèle est créé côté serveur) */
  brand?: string;
  model?: string;
  reference?: string;
  targetPrice?: number;
}

export interface UpdateWishlistItemDto {
  targetPrice: number | null;
}

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
