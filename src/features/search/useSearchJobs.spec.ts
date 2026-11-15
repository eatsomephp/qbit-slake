import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { QbtHttpError } from '@/services/qbit/http';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import type { SearchJob } from '@/types/app';

const qbit = vi.hoisted(() => ({
  getSearchJobs: vi.fn(),
  startSearch: vi.fn(),
  stopSearch: vi.fn(),
  deleteSearch: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { jobLabel, reportSearchFailure, useSearchJobs } = await import('./useSearchJobs');

const job = (id: number, over: Partial<SearchJob> = {}): SearchJob => ({
  id,
  isRunning: false,
  total: 0,
  pattern: null,
  category: null,
  plugins: null,
  ...over,
});

let wrapper: VueWrapper | undefined;

async function mountJobs(webApiVersion: string) {
  useAppStore().webApiVersion = webApiVersion;
  let api!: ReturnType<typeof useSearchJobs>;
  wrapper = mount(
    defineComponent({
      setup() {
        api = useSearchJobs();
        return () => h('div');
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  await flushPromises();
  return api;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  qbit.getSearchJobs.mockResolvedValue([]);
});

afterEach(() => wrapper?.unmount());

describe('jobLabel', () => {
  it('uses the pattern or falls back to the id', () => {
    expect(jobLabel(job(4, { pattern: 'ubuntu' }))).toBe('ubuntu');
    expect(jobLabel(job(4))).toBe('Search #4');
    expect(jobLabel(job(4, { pattern: '' }))).toBe('Search #4');
  });
});

describe('reportSearchFailure', () => {
  it('toasts everything except 403', () => {
    reportSearchFailure('Search', new QbtHttpError(403, null));
    expect(useToastsStore().toasts).toHaveLength(0);
    reportSearchFailure('Search', new Error('x'));
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Search failed: /);
  });
});

describe('useSearchJobs', () => {
  it('lists newest jobs first', async () => {
    qbit.getSearchJobs.mockResolvedValue([job(1), job(3), job(2)]);
    const api = await mountJobs('2.16.1');
    expect(api.jobs.value.map((j) => j.id)).toEqual([3, 2, 1]);
  });

  it('remembers what this browser searched when the server does not report details', async () => {
    qbit.startSearch.mockResolvedValue(7);
    const api = await mountJobs('2.11.0');
    qbit.getSearchJobs.mockResolvedValue([job(7)]);

    await expect(api.start('ubuntu', 'all', ['a', 'b'])).resolves.toBe(7);
    await flushPromises();

    expect(qbit.startSearch).toHaveBeenCalledWith('ubuntu', 'all', ['a', 'b']);
    expect(api.jobs.value[0]).toMatchObject({
      pattern: 'ubuntu',
      category: 'all',
      plugins: ['a', 'b'],
    });
  });

  it('wraps a single plugin name and does not overwrite server-reported patterns', async () => {
    qbit.startSearch.mockResolvedValue(7);
    const api = await mountJobs('2.11.0');
    qbit.getSearchJobs.mockResolvedValue([job(7, { pattern: 'from server' })]);
    await api.start('mine', 'all', 'enabled');
    await flushPromises();
    expect(api.jobs.value[0]?.pattern).toBe('from server');
    expect(JSON.parse(localStorage.getItem('slake:searchJobDetails')!)['7'].plugins).toEqual([
      'enabled',
    ]);
  });

  it('stores nothing locally when the server reports job details', async () => {
    qbit.startSearch.mockResolvedValue(7);
    const api = await mountJobs('2.16.1');
    await api.start('ubuntu', 'all', 'all');
    expect(localStorage.getItem('slake:searchJobDetails')).toBe('{}');
  });

  it('forgets remembered details for jobs that no longer exist', async () => {
    localStorage.setItem(
      'slake:searchJobDetails',
      JSON.stringify({
        '1': { pattern: 'gone', category: 'all', plugins: [] },
        '2': { pattern: 'kept', category: 'all', plugins: [] },
      }),
    );
    qbit.getSearchJobs.mockResolvedValue([job(2)]);
    const api = await mountJobs('2.11.0');
    await flushPromises();
    expect(Object.keys(JSON.parse(localStorage.getItem('slake:searchJobDetails')!))).toEqual(['2']);
    expect(api.jobs.value[0]?.pattern).toBe('kept');
  });

  it('returns null and toasts when starting fails, but stays quiet on 403', async () => {
    const api = await mountJobs('2.16.1');
    qbit.startSearch.mockRejectedValueOnce(new Error('busy'));
    await expect(api.start('x', 'all', 'all')).resolves.toBeNull();
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Search failed/);

    useToastsStore().toasts = [];
    qbit.startSearch.mockRejectedValueOnce(new QbtHttpError(403, null));
    await expect(api.start('x', 'all', 'all')).resolves.toBeNull();
    expect(useToastsStore().toasts).toHaveLength(0);
  });

  it('refetches the job list after start, stop and remove', async () => {
    const api = await mountJobs('2.16.1');
    qbit.startSearch.mockResolvedValue(1);
    let calls = qbit.getSearchJobs.mock.calls.length;

    await api.start('x', 'all', 'all');
    await flushPromises();
    expect(qbit.getSearchJobs.mock.calls.length).toBeGreaterThan(calls);

    calls = qbit.getSearchJobs.mock.calls.length;
    await api.stop(1);
    await flushPromises();
    expect(qbit.stopSearch).toHaveBeenCalledWith(1);
    expect(qbit.getSearchJobs.mock.calls.length).toBeGreaterThan(calls);

    calls = qbit.getSearchJobs.mock.calls.length;
    await api.remove([1, 2]);
    await flushPromises();
    expect(qbit.getSearchJobs.mock.calls.length).toBeGreaterThan(calls);
  });

  it('removes every job even when one fails, reporting once', async () => {
    const api = await mountJobs('2.16.1');
    qbit.deleteSearch.mockImplementation((id: number) =>
      id === 2 ? Promise.reject(new Error('gone')) : Promise.resolve(),
    );
    await api.remove([1, 2, 3]);
    expect(qbit.deleteSearch).toHaveBeenCalledTimes(3);
    expect(useToastsStore().toasts).toHaveLength(1);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Remove search failed/);
  });

  it('reports a failed stop', async () => {
    const api = await mountJobs('2.16.1');
    qbit.stopSearch.mockRejectedValue(new Error('x'));
    await api.stop(1);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Stop search failed/);
  });
});
