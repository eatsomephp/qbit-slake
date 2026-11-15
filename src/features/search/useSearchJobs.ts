import { computed, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useStorage } from '@vueuse/core';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import type { SearchJob, SearchPluginScope } from '@/types/app';

const IDLE_POLL_MS = 10_000;
const JOBS_KEY = ['search', 'jobs'];

interface JobDetails {
  pattern: string;
  category: string;
  plugins: string[];
}

export function jobLabel(job: SearchJob): string {
  return job.pattern || `Search #${job.id}`;
}

export function reportSearchFailure(label: string, err: unknown) {
  if (!(err instanceof QbtHttpError && err.status === 403))
    useToastsStore().error(`${label} failed: ${describeQbtError(err)}`);
}

export function useSearchJobs() {
  const ui = useUiStore();
  const queryClient = useQueryClient();
  const reportsDetails = useAppStore().isApiAvailable(API.searchJobDetails);
  const startedHere = useStorage<Record<string, JobDetails>>('slake:searchJobDetails', {});

  const query = useQuery({
    queryKey: JOBS_KEY,
    queryFn: ({ signal }) => qbit.getSearchJobs(signal),
    refetchInterval: (q) =>
      q.state.data?.some((job) => job.isRunning) ? ui.refreshInterval : IDLE_POLL_MS,
  });

  watch(query.data, (jobs) => {
    if (!jobs || reportsDetails) return;
    const live = new Set(jobs.map((job) => String(job.id)));
    if (Object.keys(startedHere.value).some((id) => !live.has(id)))
      startedHere.value = Object.fromEntries(
        Object.entries(startedHere.value).filter(([id]) => live.has(id)),
      );
  });

  const jobs = computed(() =>
    (query.data.value ?? [])
      .map((job) => {
        const local = startedHere.value[job.id];
        return local && job.pattern === null ? { ...job, ...local } : job;
      })
      .toSorted((a, b) => b.id - a.id),
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: JOBS_KEY });
  }

  async function start(
    pattern: string,
    category: string,
    scope: SearchPluginScope,
  ): Promise<number | null> {
    try {
      const id = await qbit.startSearch(pattern, category, scope);
      if (!reportsDetails)
        startedHere.value = {
          ...startedHere.value,
          [id]: { pattern, category, plugins: typeof scope === 'string' ? [scope] : scope },
        };
      return id;
    } catch (err) {
      reportSearchFailure('Search', err);
      return null;
    } finally {
      refresh();
    }
  }

  async function stop(id: number) {
    try {
      await qbit.stopSearch(id);
    } catch (err) {
      reportSearchFailure('Stop search', err);
    }
    refresh();
  }

  async function remove(ids: number[]) {
    const results = await Promise.allSettled(ids.map((id) => qbit.deleteSearch(id)));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) reportSearchFailure('Remove search', failure.reason);
    refresh();
  }

  return {
    jobs,
    isPending: query.isPending,
    error: query.error,
    start,
    stop,
    remove,
  };
}
