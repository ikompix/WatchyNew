import { useQuery } from '@tanstack/react-query';
import type { MeResult } from '@watchy/types';
import { apiGet, unwrap } from '@/lib/api-client';

/** Plan + compteurs de quotas de l'utilisateur (GET /me). */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => unwrap(await apiGet<MeResult>('/me')),
    staleTime: 60_000,
  });
}
