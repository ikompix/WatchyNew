import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWatchDto, UpdateWatchDto, Watch } from '@watchy/types';
import { apiDelete, apiGet, apiPatch, apiPost, unwrap } from '@/lib/api-client';

function parseWatch(w: Watch): Watch {
  return {
    ...w,
    // Drizzle stores numeric as string — coerce at boundary
    purchasePrice: w.purchasePrice != null ? Number(w.purchasePrice) : null,
  };
}

export function useWatches() {
  return useQuery({
    queryKey: ['watches'],
    queryFn: async () => {
      const res = await apiGet<Watch[]>('/watches');
      return unwrap(res).map(parseWatch);
    },
  });
}

export function useWatch(id: string) {
  return useQuery({
    queryKey: ['watches', id],
    queryFn: async () => {
      const res = await apiGet<Watch>(`/watches/${id}`);
      return parseWatch(unwrap(res));
    },
    enabled: !!id,
  });
}

export function useCreateWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateWatchDto) => {
      const res = await apiPost<Watch>('/watches', dto);
      return parseWatch(unwrap(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watches'] });
      // Le compteur x/5 de /me vient de bouger
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdateWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateWatchDto }) => {
      const res = await apiPatch<Watch>(`/watches/${id}`, dto);
      return parseWatch(unwrap(res));
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['watches'] });
      qc.invalidateQueries({ queryKey: ['watches', id] });
    },
  });
}

export function useDeleteWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete<{ id: string }>(`/watches/${id}`);
      return unwrap(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watches'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
