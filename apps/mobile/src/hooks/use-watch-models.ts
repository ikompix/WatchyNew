import { useQuery } from '@tanstack/react-query';
import type { WatchModel } from '@watchy/types';
import { apiGet } from '@/lib/api-client';

export function useWatchModelSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['watch-models', trimmed],
    queryFn: async () => {
      const res = await apiGet<WatchModel[]>(`/watch-models?q=${encodeURIComponent(trimmed)}`);
      if (res.error) throw new Error(res.error.message);
      return res.data!;
    },
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}
