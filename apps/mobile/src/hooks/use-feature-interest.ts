import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, unwrap } from '@/lib/api-client';

/** Features à venir pour lesquelles l'utilisateur a demandé à être prévenu. */
export function useFeatureInterest() {
  return useQuery({
    queryKey: ['feature-interest'],
    queryFn: async () => unwrap(await apiGet<{ features: string[] }>('/me/feature-interest')),
    staleTime: 5 * 60_000,
  });
}

export function useRegisterInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (feature: 'community') =>
      unwrap(await apiPost<{ ok: true }>('/me/feature-interest', { feature })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-interest'] }),
  });
}
