import { useQueries } from '@tanstack/react-query';
import type { MarketPrice, Watch } from '@watchy/types';
import { apiGet } from '@/lib/api-client';

export type WatchValuation = {
  /** Valeur affichée : cote actuelle si connue, sinon prix d'achat */
  value: number | null;
  /** Série chronologique (ancien → récent) pour la sparkline */
  series: number[];
  /** % d'évolution sur la fenêtre connue */
  deltaPct: number | null;
};

export type CollectionMarket = {
  byWatchId: Record<string, WatchValuation>;
  /** Somme des valeurs affichées */
  totalValue: number;
  /** Évolution agrégée (pondérée par la valeur) */
  totalDeltaPct: number | null;
  /** Série agrégée pour la sparkline de la carte valeur totale */
  totalSeries: number[];
  isLoading: boolean;
};

async function fetchSeries(watchId: string): Promise<number[]> {
  const res = await apiGet<MarketPrice[]>(`/market-prices/watch/${watchId}`);
  if (res.error) throw new Error(res.error.message);
  // API renvoie du plus récent au plus ancien → on remet en chronologique
  return (res.data ?? []).map((p) => Number(p.price)).reverse();
}

/**
 * Valorisation de la collection : cote par montre (variante si attributs) —
 * cohérente avec la fiche. Agrégats dérivés pour la carte « Valeur totale ».
 */
export function useCollectionMarket(watches: Watch[] | undefined): CollectionMarket {
  const watchIds = (watches ?? []).filter((w) => w.watchModelId).map((w) => w.id);

  const queries = useQueries({
    queries: watchIds.map((watchId) => ({
      // Suffixe 'series' : useMarketPrices utilise la même base de clé avec un
      // autre format de données — même clé = cache empoisonné
      queryKey: ['market-prices', 'watch', watchId, 'series'],
      queryFn: () => fetchSeries(watchId),
      staleTime: 5 * 60_000,
    })),
  });

  const seriesByWatch = new Map<string, number[]>();
  watchIds.forEach((id, i) => {
    if (queries[i].data) seriesByWatch.set(id, queries[i].data!);
  });

  const byWatchId: Record<string, WatchValuation> = {};
  let totalValue = 0;
  let weightedDelta = 0;
  let weightedBase = 0;
  const memberSeries: number[][] = [];

  for (const w of watches ?? []) {
    const series = seriesByWatch.get(w.id) ?? [];
    const latest = series.length > 0 ? series[series.length - 1] : null;
    const first = series.length > 0 ? series[0] : null;
    const value = latest ?? w.purchasePrice ?? null;
    const deltaPct =
      latest != null && first != null && first > 0 && series.length > 1
        ? ((latest - first) / first) * 100
        : null;

    byWatchId[w.id] = { value, series, deltaPct };
    if (value != null) {
      totalValue += value;
      if (deltaPct != null) {
        weightedDelta += deltaPct * value;
        weightedBase += value;
      }
    }
    if (series.length > 1) memberSeries.push(series);
  }

  // Série agrégée : somme des séries normalisées à la même longueur
  const maxLen = Math.max(0, ...memberSeries.map((s) => s.length));
  const totalSeries: number[] = [];
  if (maxLen > 1) {
    for (let i = 0; i < maxLen; i++) {
      let sum = 0;
      for (const s of memberSeries) {
        // Séries plus courtes : on prolonge la première valeur vers le passé
        const idx = i - (maxLen - s.length);
        sum += s[Math.max(0, idx)];
      }
      totalSeries.push(sum);
    }
  }

  return {
    byWatchId,
    totalValue,
    totalDeltaPct: weightedBase > 0 ? weightedDelta / weightedBase : null,
    totalSeries,
    isLoading: queries.some((q) => q.isLoading),
  };
}
