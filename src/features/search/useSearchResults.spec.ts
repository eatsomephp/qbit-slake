import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, shallowRef, type EffectScope, type Ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QbtHttpError } from '@/services/qbit/http';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import type { SearchJob, SearchResult, SearchResultsPage } from '@/types/app';

const qbit = vi.hoisted(() => ({ getSearchResults: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { useSearchResults } = await import('./useSearchResults');

const res = (index: number): SearchResult => ({
  index,
  name: `r${index}`,
  url: '',
  size: null,
  seeds: null,
  leechers: null,
  engine: 'e',
  engineFullName: '',
  siteUrl: '',
  descriptionUrl: '',
  publishedAt: null,
});

const page = (indexes: number[], total: number, isRunning: boolean): SearchResultsPage => ({
  isRunning,
  total,
  results: indexes.map(res),
});

const job = (id: number) => ({ id }) as SearchJob;

let scope: EffectScope;
let selected: Ref<SearchJob | null>;

function start(initial: SearchJob | null) {
  selected = shallowRef<SearchJob | null>(initial);
  scope = effectScope();
  return scope.run(() => useSearchResults(selected))!;
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setActivePinia(createPinia());
  useUiStore().refreshInterval = 1000;
  qbit.getSearchResults.mockReset();
});

afterEach(() => {
  scope?.stop();
  vi.useRealTimers();
});

describe('useSearchResults', () => {
  it('does nothing without a selected job', async () => {
    const api = start(null);
    await tick(5000);
    expect(qbit.getSearchResults).not.toHaveBeenCalled();
    expect(api.results.value).toEqual([]);
    expect(api.isLoading.value).toBe(false);
  });

  it('shows loading until the first page arrives', async () => {
    qbit.getSearchResults.mockResolvedValue(page([0], 1, false));
    const api = start(job(1));
    expect(api.isLoading.value).toBe(true);
    await tick();
    expect(api.isLoading.value).toBe(false);
    expect(api.results.value.map((r) => r.index)).toEqual([0]);
  });

  it('fetches incrementally from the current offset while the job runs', async () => {
    qbit.getSearchResults
      .mockResolvedValueOnce(page([0, 1], 3, true))
      .mockResolvedValueOnce(page([2], 3, false));
    const api = start(job(1));
    await tick();
    expect(qbit.getSearchResults).toHaveBeenLastCalledWith(1, 0, expect.any(AbortSignal));
    expect(api.results.value).toHaveLength(2);

    await tick(1000);
    expect(qbit.getSearchResults).toHaveBeenLastCalledWith(1, 2, expect.any(AbortSignal));
    expect(api.results.value.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('stops polling once the job finished and all results arrived', async () => {
    qbit.getSearchResults.mockResolvedValue(page([0], 1, false));
    start(job(1));
    await tick(10_000);
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(1);
  });

  it('keeps polling when the job stopped but results are still missing', async () => {
    qbit.getSearchResults
      .mockResolvedValueOnce(page([0], 2, false))
      .mockResolvedValueOnce(page([1], 2, false));
    const api = start(job(1));
    await tick(1000);
    expect(api.results.value).toHaveLength(2);
  });

  it('keeps results per job and does not refetch a completed one', async () => {
    qbit.getSearchResults
      .mockResolvedValueOnce(page([0], 1, false))
      .mockResolvedValueOnce(page([5, 6], 2, false));
    const api = start(job(1));
    await tick();
    selected.value = job(2);
    await nextTick();
    await tick();
    expect(api.results.value.map((r) => r.index)).toEqual([5, 6]);

    selected.value = job(1);
    await nextTick();
    expect(api.results.value.map((r) => r.index)).toEqual([0]);
    expect(api.isLoading.value).toBe(false);
    await tick(5000);
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(2);
  });

  it('clears results and aborts the old job when the selection is cleared', async () => {
    qbit.getSearchResults.mockResolvedValue(page([0], 5, true));
    const api = start(job(1));
    await tick();
    selected.value = null;
    await nextTick();
    expect(api.results.value).toEqual([]);
    const calls = qbit.getSearchResults.mock.calls.length;
    await tick(5000);
    expect(qbit.getSearchResults.mock.calls.length).toBe(calls);
  });

  it('ignores a response that arrives after switching jobs', async () => {
    let resolveFirst!: (p: SearchResultsPage) => void;
    qbit.getSearchResults
      .mockImplementationOnce((_id: number, _o: number, signal: AbortSignal) => {
        return new Promise<SearchResultsPage>((resolve) => {
          resolveFirst = (p) => resolve(signal.aborted ? p : p);
        });
      })
      .mockResolvedValueOnce(page([9], 1, false));
    const api = start(job(1));
    selected.value = job(2);
    await nextTick();
    await tick();
    resolveFirst(page([0], 1, false));
    await tick();
    expect(api.results.value.map((r) => r.index)).toEqual([9]);
  });

  it('retries after a network error', async () => {
    qbit.getSearchResults
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(page([0], 1, false));
    const api = start(job(1));
    await tick();
    expect(api.results.value).toEqual([]);
    expect(useToastsStore().toasts).toHaveLength(0);
    await tick(3000);
    expect(api.results.value).toHaveLength(1);
  });

  it('gives up on 404 silently, but reports other HTTP errors', async () => {
    qbit.getSearchResults.mockRejectedValue(new QbtHttpError(404, null));
    start(job(1));
    await tick(10_000);
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(1);
    expect(useToastsStore().toasts).toHaveLength(0);
    scope.stop();

    qbit.getSearchResults.mockReset().mockRejectedValue(new QbtHttpError(500, null));
    start(job(1));
    await tick(2000);
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(1);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Loading results failed/);
  });

  it('forget discards a job so it is fetched from scratch next time', async () => {
    qbit.getSearchResults.mockResolvedValue(page([0], 1, false));
    const api = start(job(1));
    await tick();
    api.forget([1]);
    selected.value = null;
    await nextTick();
    selected.value = job(1);
    await nextTick();
    await tick();
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(2);
    expect(qbit.getSearchResults).toHaveBeenLastCalledWith(1, 0, expect.any(AbortSignal));
  });

  it('stops polling when disposed', async () => {
    qbit.getSearchResults.mockResolvedValue(page([0], 9, true));
    start(job(1));
    await tick();
    scope.stop();
    await tick(10_000);
    expect(qbit.getSearchResults).toHaveBeenCalledTimes(1);
  });
});
