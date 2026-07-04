import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpertReportStatus } from '@watchy/types';
import { apiGet, apiPost, unwrap } from '@/lib/api-client';

/** État du rapport d'expert — repolle tant que la génération est en cours (~1-2 min). */
export function useExpertReport(watchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['expert-report', watchId],
    queryFn: async () => unwrap(await apiGet<ExpertReportStatus>(`/watches/${watchId}/expert-report`)),
    enabled: enabled && !!watchId,
    refetchInterval: (query) => (query.state.data?.generating ? 5_000 : false),
  });
}

export function useGenerateExpertReport(watchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiPost<ExpertReportStatus>(`/watches/${watchId}/expert-report`, {})),
    onSuccess: (data) => qc.setQueryData(['expert-report', watchId], data),
  });
}
