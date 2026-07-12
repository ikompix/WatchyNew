import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPrefs } from '@watchy/types';
import { apiGet, apiPatch, unwrap } from '@/lib/api-client';

export function useNotificationPrefs(enabled = true) {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: async () => unwrap(await apiGet<NotificationPrefs>('/me/notification-prefs')),
    staleTime: 60_000,
    enabled,
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: NotificationPrefs) =>
      unwrap(await apiPatch<NotificationPrefs>('/me/notification-prefs', prefs)),
    // Optimiste : le Switch répond immédiatement, rollback si l'API échoue
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey: ['notification-prefs'] });
      const previous = qc.getQueryData<NotificationPrefs>(['notification-prefs']);
      qc.setQueryData(['notification-prefs'], prefs);
      return { previous };
    },
    onError: (_err, _prefs, ctx) => {
      if (ctx?.previous) qc.setQueryData(['notification-prefs'], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}
