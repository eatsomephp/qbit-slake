import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { QbtHttpError } from '@/services/qbit/http';
import { useToastsStore } from '@/stores/toasts';
import type { SearchPlugin } from '@/types/app';

const qbit = vi.hoisted(() => ({
  getSearchPlugins: vi.fn(),
  installSearchPlugins: vi.fn(),
  uninstallSearchPlugins: vi.fn(),
  setSearchPluginsEnabled: vi.fn(),
  updateSearchPlugins: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { useSearchPlugins } = await import('./useSearchPlugins');

const plugin = (name: string, over: Partial<SearchPlugin> = {}): SearchPlugin => ({
  name,
  fullName: name.toUpperCase(),
  version: '1',
  url: '',
  isEnabled: true,
  categories: [],
  ...over,
});

let wrapper: VueWrapper | undefined;

async function mountPlugins() {
  let api!: ReturnType<typeof useSearchPlugins>;
  wrapper = mount(
    defineComponent({
      setup() {
        api = useSearchPlugins();
        return () => h('div');
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  await flushPromises();
  return api;
}

beforeEach(() => {
  setActivePinia(createPinia());
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  qbit.getSearchPlugins.mockResolvedValue([
    plugin('zeta'),
    plugin('alpha', { isEnabled: false }),
    plugin('mid'),
  ]);
});

afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('useSearchPlugins', () => {
  it('sorts by full name and filters the enabled ones', async () => {
    const api = await mountPlugins();
    expect(api.plugins.value.map((p) => p.name)).toEqual(['alpha', 'mid', 'zeta']);
    expect(api.enabledPlugins.value.map((p) => p.name)).toEqual(['mid', 'zeta']);
  });

  it('resolves full names and falls back to the given name', async () => {
    const api = await mountPlugins();
    expect(api.fullNameOf('mid')).toBe('MID');
    expect(api.fullNameOf('unknown')).toBe('unknown');
  });

  it('calls the matching endpoint and refetches afterwards', async () => {
    const api = await mountPlugins();
    const alpha = api.plugins.value[0]!;
    let calls = qbit.getSearchPlugins.mock.calls.length;

    await expect(api.setEnabled(alpha, true)).resolves.toBe(true);
    expect(qbit.setSearchPluginsEnabled).toHaveBeenCalledWith(['alpha'], true);
    await flushPromises();
    expect(qbit.getSearchPlugins.mock.calls.length).toBeGreaterThan(calls);

    calls = qbit.getSearchPlugins.mock.calls.length;
    await api.uninstall(alpha);
    expect(qbit.uninstallSearchPlugins).toHaveBeenCalledWith(['alpha']);
    await flushPromises();
    expect(qbit.getSearchPlugins.mock.calls.length).toBeGreaterThan(calls);
  });

  it('labels enable and disable failures separately', async () => {
    const api = await mountPlugins();
    qbit.setSearchPluginsEnabled.mockRejectedValue(new Error('x'));
    await expect(api.setEnabled(plugin('a'), false)).resolves.toBe(false);
    await api.setEnabled(plugin('a'), true);
    expect(useToastsStore().toasts.map((t) => t.message.split(' failed')[0])).toEqual([
      'Disable plugin',
      'Enable plugin',
    ]);
  });

  it('stays quiet on 403 but still returns false', async () => {
    const api = await mountPlugins();
    qbit.installSearchPlugins.mockRejectedValue(new QbtHttpError(403, null));
    await expect(api.install(['http://x'])).resolves.toBe(false);
    expect(useToastsStore().toasts).toHaveLength(0);
  });

  it('keeps re-polling after install and update, because they finish in the background', async () => {
    const api = await mountPlugins();
    vi.useFakeTimers();
    await api.install(['http://x']);
    await vi.advanceTimersByTimeAsync(0);
    const afterInstall = qbit.getSearchPlugins.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(qbit.getSearchPlugins.mock.calls.length).toBeGreaterThanOrEqual(afterInstall + 2);
    expect(qbit.installSearchPlugins).toHaveBeenCalledWith(['http://x']);

    await vi.advanceTimersByTimeAsync(40_000);
    const settled = qbit.getSearchPlugins.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(qbit.getSearchPlugins.mock.calls.length).toBe(settled);
  });

  it('does not poll in the background for enable/disable', async () => {
    const api = await mountPlugins();
    vi.useFakeTimers();
    await api.setEnabled(plugin('mid'), false);
    await vi.advanceTimersByTimeAsync(0);
    const calls = qbit.getSearchPlugins.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(qbit.getSearchPlugins.mock.calls.length).toBe(calls);
  });
});
