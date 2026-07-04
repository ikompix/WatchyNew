import { useQuery } from '@tanstack/react-query';
import type { PortfolioSummary } from '@watchy/types';
import { apiGet, unwrap } from '@/lib/api-client';

/** Agrégats patrimoniaux serveur (premium — 403 PREMIUM_REQUIRED sinon). */
export function usePortfolio(enabled: boolean) {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => unwrap(await apiGet<PortfolioSummary>('/portfolio')),
    enabled,
    staleTime: 5 * 60_000,
  });
}
