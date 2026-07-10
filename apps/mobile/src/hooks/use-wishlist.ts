import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddWishlistItemDto, WishlistItem } from '@watchy/types';
import { apiDelete, apiGet, apiPost, unwrap } from '@/lib/api-client';

export function useWishlist() {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => unwrap(await apiGet<WishlistItem[]>('/wishlist')),
    // Photo et cote arrivent en tâche de fond côté serveur après l'ajout —
    // on repolle tant qu'un item récent (< 5 min) attend encore son visuel
    refetchInterval: (query) => {
      const items = query.state.data;
      const waiting = items?.some(
        (i) => !i.model.photoUrl && Date.now() - new Date(i.createdAt).getTime() < 5 * 60_000
      );
      return waiting ? 10_000 : false;
    },
  });
}

export function useAddToWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: AddWishlistItemDto) =>
      unwrap(await apiPost<WishlistItem>('/wishlist', dto)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      // Le quota combiné (collection + wishlist) vient de bouger
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useRemoveFromWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await apiDelete<{ id: string }>(`/wishlist/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
