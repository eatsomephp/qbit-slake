import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';
import qbit, { QbtHttpError } from '@/services/qbit';
import { useUiStore } from '@/stores/ui';
import type { SearchJob, SearchResult } from '@/types/app';
import { reportSearchFailure } from './useSearchJobs';

const RETRY_AFTER_NETWORK_ERROR_MS = 3000;

interface LoadedResults {
  results: SearchResult[];
  isComplete: boolean;
}

/** The selected job's results, fetched incrementally (jobs only append) and kept per job while mounted. */
export function useSearchResults(job: Ref<SearchJob | null>) {
  const ui = useUiStore();
  const loaded = new Map<number, LoadedResults>();
  const results = shallowRef<SearchResult[]>([]);
  const isLoading = shallowRef(false);
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
  }

  async function poll(id: number, signal: AbortSignal) {
    const entry = loaded.get(id) ?? { results: [], isComplete: false };
    loaded.set(id, entry);
    try {
      const page = await qbit.getSearchResults(id, entry.results.length, signal);
      if (signal.aborted) return;
      if (page.results.length) entry.results = entry.results.concat(page.results);
      entry.isComplete = !page.isRunning && entry.results.length >= page.total;
      results.value = entry.results;
      isLoading.value = false;
      if (!entry.isComplete) timer = setTimeout(() => void poll(id, signal), ui.refreshInterval);
    } catch (err) {
      if (signal.aborted) return;
      isLoading.value = false;
      if (err instanceof QbtHttpError) {
        if (err.status !== 404) reportSearchFailure('Loading results', err);
      } else timer = setTimeout(() => void poll(id, signal), RETRY_AFTER_NETWORK_ERROR_MS);
    }
  }

  function load(id: number | null) {
    stop();
    const entry = id === null ? undefined : loaded.get(id);
    results.value = entry?.results ?? [];
    if (id === null || entry?.isComplete) {
      isLoading.value = false;
      return;
    }
    isLoading.value = !entry;
    const { signal } = (controller = new AbortController());
    void poll(id, signal);
  }

  watch(
    () => job.value?.id ?? null,
    (id) => load(id),
    { immediate: true },
  );

  function forget(ids: number[]) {
    for (const id of ids) loaded.delete(id);
  }

  onScopeDispose(stop);

  return { results, isLoading, forget };
}
