import { useQuery } from '@tanstack/react-query';
import type { MarketPrice } from '@watchy/types';
import { apiGet } from '@/lib/api-client';

export type MarketSummary = {
  latest: MarketPrice | null;
  /** % change between the oldest and newest point of the returned window */
  trendPct: number | null;
  history: MarketPrice[];
  /** true si la cote affichée est celle de la variante précise (watch_id) */
  isVariant: boolean;
};

function toSummary(data: MarketPrice[]): MarketSummary {
  // API renvoie du plus récent au plus ancien — numerics en string (Drizzle)
  const history = data.map((p) => ({
    ...p,
    price: Number(p.price),
    fullSetPrice: p.fullSetPrice != null ? Number(p.fullSetPrice) : null,
  }));
  const latest = history[0] ?? null;
  const oldest = history[history.length - 1] ?? null;
  const trendPct =
    latest && oldest && oldest.price > 0 && latest.id !== oldest.id
      ? ((latest.price - oldest.price) / oldest.price) * 100
      : null;
  return { latest, trendPct, history, isVariant: latest?.watchId != null };
}

/** Cote d'une montre précise (variante si attributs, sinon base du modèle). */
export function useMarketPrices(watchId: string | null | undefined) {
  return useQuery({
    queryKey: ['market-prices', 'watch', watchId],
    queryFn: async (): Promise<MarketSummary> => {
      const res = await apiGet<MarketPrice[]>(`/market-prices/watch/${watchId}`);
      if (res.error) throw new Error(res.error.message);
      return toSummary(res.data ?? []);
    },
    enabled: !!watchId,
    staleTime: 5 * 60_000,
  });
}

/** Cote de base d'un modèle du catalogue (estimation de la sheet de reconnaissance). */
export function useModelEstimate(watchModelId: string | null | undefined) {
  return useQuery({
    queryKey: ['market-prices', 'model', watchModelId],
    queryFn: async (): Promise<MarketSummary> => {
      const res = await apiGet<MarketPrice[]>(`/market-prices/${watchModelId}`);
      if (res.error) throw new Error(res.error.message);
      return toSummary(res.data ?? []);
    },
    enabled: !!watchModelId,
    staleTime: 5 * 60_000,
  });
}
