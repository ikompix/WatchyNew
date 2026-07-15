import type { WatchCondition, WatchModel } from './watch';

export interface CreateWatchDto {
  watchModelId?: string;
  brand: string;
  model: string;
  reference?: string;
  nickname?: string;
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

/** PATCH partiel : champ absent = inchangé, `null` = effacé. */
export type UpdateWatchDto = {
  brand?: string;
  model?: string;
  hasPapers?: boolean;
  hasBox?: boolean;
  watchModelId?: string;
  photoUrl?: string;
  reference?: string | null;
  nickname?: string | null;
  dialColor?: string | null;
  productionYear?: number | null;
  condition?: WatchCondition | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  notes?: string | null;
};

export interface RecognizeWatchDto {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Pool visé par le scan — gate le quota d'emplacements correspondant (défaut : collection) */
  target?: 'collection' | 'wishlist';
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
  /** Surnom de collectionneurs largement établi pour la référence identifiée, null sinon */
  nickname: string | null;
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

export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';
export type Expertise = 'novice' | 'passionne' | 'collectionneur' | 'metier';

/** Profil déclaratif facultatif — volontairement non sensible (tranche d'âge, ville/pays). */
export interface UserProfile {
  ageRange: AgeRange | null;
  city: string | null;
  country: string | null;
  expertise: Expertise | null;
}

export interface MeResult {
  plan: Plan;
  watchCount: number;
  wishlistCount: number;
  /** Limite d'emplacements collection (gratuits + achetés), null = illimité (premium) */
  watchSlotsLimit: number | null;
  /** Limite d'emplacements wishlist (gratuits + achetés), null = illimité (premium) */
  wishlistSlotsLimit: number | null;
  /** @deprecated Rétrocompat builds ≤ 1.1 (affichage combiné) — somme des deux pools */
  slotsUsed: number;
  /** @deprecated Rétrocompat builds ≤ 1.1 — somme des deux limites, null = illimité */
  slotsLimit: number | null;
  /** @deprecated La feature crédits de scan n'existe plus — toujours 0 */
  scansUsed: number;
  /** @deprecated Toujours null */
  scansLimit: number | null;
  /** @deprecated Toujours 0 */
  scanCredits: number;
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

export interface WishlistItem {
  id: string;
  watchModelId: string;
  /** Photo facultative uploadée par l'utilisateur (visuel de l'item) */
  photoUrl: string | null;
  createdAt: string;
  model: WatchModel;
  /** Dernière cote de base connue du modèle */
  currentPrice: number | null;
  currency: string;
  /** Compte free au-delà du quota : verrouillé en lecture, jamais supprimé */
  locked?: boolean;
}

export interface AddWishlistItemDto {
  /** Modèle du catalogue… */
  watchModelId?: string;
  /** …ou saisie libre (le modèle est créé côté serveur) */
  brand?: string;
  model?: string;
  reference?: string;
  photoUrl?: string;
}

/** Préférences de notifications — absence de ligne côté serveur = tout activé. */
export interface NotificationPrefs {
  priceAlerts: boolean;
}

/** Document du coffre-fort (premium) — l'URL est signée courte durée, à re-demander. */
export interface WatchDocument {
  id: string;
  label: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** URL signée (1 h) — jamais à persister côté client */
  url: string;
}

export interface AddWatchDocumentDto {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  label?: string;
}

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
