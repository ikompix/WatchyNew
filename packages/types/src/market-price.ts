import type { Watch } from './watch';

export interface MarketPrice {
  id: string;
  watchModelId: string;
  /** Non nul = cote de la variante précise de cette montre */
  watchId: string | null;
  price: number;
  /** Cote full set (boîte + papiers), null si non relevée */
  fullSetPrice: number | null;
  currency: string;
  source: string | null;
  fetchedAt: string;
}

export interface WatchWithMarketData extends Watch {
  latestMarketPrice: MarketPrice | null;
  priceChangePct: number | null;
}
