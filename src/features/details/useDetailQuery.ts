import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useUiStore } from '@/stores/ui';

/**
 * Polls one detail endpoint for the given torrent while the calling tab is mounted.
 * The AbortSignal is passed through, so leaving the tab cancels the request.
 */
export function useDetailQuery<T>(
  key: string,
  hash: Ref<string | null>,
  fetch: (hash: string, signal: AbortSignal) => Promise<T>,
) {
  const ui = useUiStore();
  return useQuery({
    queryKey: computed(() => [key, hash.value]),
    queryFn: ({ signal }) => fetch(hash.value!, signal),
    enabled: computed(() => hash.value !== null),
    refetchInterval: computed(() => ui.refreshInterval),
    gcTime: 0,
    retry: false,
  });
}
