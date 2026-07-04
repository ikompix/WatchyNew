import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RecognizeWatchDto, RecognizeWatchResult } from '@watchy/types';
import { apiPost, unwrap } from '@/lib/api-client';

export function useRecognizeWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: RecognizeWatchDto) => {
      const res = await apiPost<RecognizeWatchResult>('/recognition', dto);
      return unwrap(res);
    },
    // Chaque scan consomme le quota mensuel free affiché par /me
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
