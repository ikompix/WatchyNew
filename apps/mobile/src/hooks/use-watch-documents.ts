import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddWatchDocumentDto, WatchDocument } from '@watchy/types';
import { apiDelete, apiGet, apiPost, unwrap } from '@/lib/api-client';

export function useWatchDocuments(watchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['watch-documents', watchId],
    queryFn: async () => {
      const res = await apiGet<WatchDocument[]>(`/watches/${watchId}/documents`);
      return unwrap(res);
    },
    // Les URLs signées expirent (1 h) — pas de cache long
    staleTime: 30 * 60 * 1000,
    enabled: enabled && !!watchId,
  });
}

export function useAddWatchDocument(watchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: AddWatchDocumentDto) => {
      const res = await apiPost<WatchDocument>(`/watches/${watchId}/documents`, dto);
      return unwrap(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watch-documents', watchId] });
    },
  });
}

export function useDeleteWatchDocument(watchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiDelete<{ id: string }>(`/watches/${watchId}/documents/${docId}`);
      return unwrap(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watch-documents', watchId] });
    },
  });
}
