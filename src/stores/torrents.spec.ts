import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed, effect } from 'vue';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import type { RawTorrent } from '@/types/qbit';
import { useTorrentsStore } from './torrents';
import { useUiStore } from './ui';
import { useSelectionStore } from './selection';

function raw(name: string, overrides: Partial<RawTorrent> = {}): Partial<RawTorrent> {
  return { ...DEFAULT_RAW_TORRENT, name, ...overrides };
}

function bigSnapshot(n: number) {
  const torrents: Record<string, Partial<RawTorrent>> = {};
  for (let i = 0; i < n; i++) torrents[`h${i}`] = raw(`t${i}`, { size: i });
  return { rid: 1, full_update: true, torrents };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('torrents store', () => {
  it('triggers dependents once per poll regardless of how many torrents changed', () => {
    const store = useTorrentsStore();
    store.apply(bigSnapshot(2000));

    const runs = vi.fn();
    effect(() => {
      runs(store.all.length);
    });
    runs.mockClear();

    const torrents: Record<string, Partial<RawTorrent>> = {};
    for (let i = 0; i < 1500; i++) torrents[`h${i}`] = { dlspeed: i + 1 };
    store.apply({ rid: 2, torrents });

    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('does not trigger for an rid-only diff', () => {
    const store = useTorrentsStore();
    store.apply(bigSnapshot(3));
    const version = store.version;
    store.apply({ rid: 2 });
    expect(store.version).toBe(version);
  });

  it('keeps torrent identity across polls in filteredSorted', () => {
    const store = useTorrentsStore();
    store.apply(bigSnapshot(10));
    const before = new Map(store.filteredSorted.map((t) => [t.hash, t]));
    store.apply({ rid: 2, torrents: { h3: { upspeed: 5 } } });
    for (const t of store.filteredSorted) expect(t).toBe(before.get(t.hash));
  });

  it('sorts by the ui store sorting and re-sorts when it changes', () => {
    const store = useTorrentsStore();
    const ui = useUiStore();
    store.apply(bigSnapshot(5));
    ui.sorting = [{ id: 'size', desc: true }];
    expect(store.filteredSorted.map((t) => t.size)).toEqual([4, 3, 2, 1, 0]);
    ui.sorting = [{ id: 'size', desc: false }];
    expect(store.filteredSorted.map((t) => t.size)).toEqual([0, 1, 2, 3, 4]);
  });

  it('exposes server state and small collections as fresh copies per poll', () => {
    const store = useTorrentsStore();
    store.apply({ rid: 1, full_update: true, tags: ['a'], server_state: { dl_info_speed: 1 } });
    const speed = computed(() => store.serverState.dl_info_speed);
    expect(speed.value).toBe(1);
    store.apply({ rid: 2, server_state: { dl_info_speed: 2 } });
    expect(speed.value).toBe(2);
    expect(store.tags).toEqual(['a']);
  });

  it('reset clears the collection', () => {
    const store = useTorrentsStore();
    store.apply(bigSnapshot(3));
    store.reset();
    expect(store.all).toEqual([]);
    expect(store.connection).toBe('connecting');
  });
});

describe('filters in the store', () => {
  function seedMixed() {
    const store = useTorrentsStore();
    store.apply({
      rid: 1,
      full_update: true,
      torrents: {
        a: raw('alpha', { category: 'linux', state: 'stalledUP' as RawTorrent['state'] }),
        b: raw('beta', { category: 'movies', state: 'downloading' as RawTorrent['state'] }),
        c: raw('gamma', { category: 'linux', state: 'stoppedDL' as RawTorrent['state'] }),
      },
      categories: {
        linux: { name: 'linux', savePath: '' },
        movies: { name: 'movies', savePath: '' },
      },
      trackers: { 'https://t.example/announce': ['a', 'b'] },
    });
    return store;
  }

  it('filteredSorted applies sidebar filters and search', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.sorting = [{ id: 'name', desc: false }];
    ui.filters = { ...ui.filters, category: { include: ['linux'], exclude: [] } };
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['a', 'c']);
    ui.search = 'gam';
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['c']);
    ui.clearFilters();
    expect(store.filteredSorted).toHaveLength(3);
  });

  it('does not text-filter on filter tokens left in the search box', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.search = 'tag:x state:nope ratio>2';
    expect(store.filteredSorted).toHaveLength(3);
    ui.search = 'tag:x gam';
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['c']);
  });

  it('filters by conditions and combines them with other filters', () => {
    const store = seedMixed();
    store.apply({
      rid: 2,
      torrents: {
        a: { size: 100, ratio: 3 },
        b: { size: 100, ratio: 1 },
        c: { size: 10, ratio: 3 },
      },
    });
    const ui = useUiStore();
    ui.sorting = [{ id: 'name', desc: false }];
    ui.filters = { ...ui.filters, conditions: [{ field: 'ratio', operator: '>', value: 2 }] };
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['a', 'c']);
    ui.filters = {
      ...ui.filters,
      conditions: [...ui.filters.conditions, { field: 'size', operator: '>=', value: 100 }],
    };
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['a']);
    ui.filters = { ...ui.filters, conditions: [] };
    expect(store.filteredSorted).toHaveLength(3);
  });

  it('re-evaluates age conditions against the current time on each poll', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(10_000_000 * 1000);
      const store = seedMixed();
      store.apply({ rid: 2, torrents: { a: { added_on: 10_000_000 - 50 } } });
      const ui = useUiStore();
      ui.filters = { ...ui.filters, conditions: [{ field: 'added', operator: '<', value: 100 }] };
      expect(store.filteredSorted.map((t) => t.hash)).toEqual(['a']);
      vi.setSystemTime((10_000_000 + 100) * 1000);
      store.apply({ rid: 3, torrents: { b: { dlspeed: 1 } } });
      expect(store.filteredSorted).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters by tracker host from the maindata trackers map', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.filters = { ...ui.filters, tracker: { include: [''], exclude: [] } };
    expect(store.filteredSorted.map((t) => t.hash)).toEqual(['c']);
    expect(store.counts.tracker.get('t.example')).toBe(2);
  });

  it('counts are independent of active filters', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.filters = { ...ui.filters, category: { include: ['movies'], exclude: [] } };
    expect(store.counts.category.get('linux')).toBe(2);
    expect(store.counts.state.downloading).toBe(1);
    expect(store.counts.state.stopped).toBe(1);
  });

  it('sidebarCounts apply the other filters and the search by default, counts stay global', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.filters = { ...ui.filters, category: { include: ['movies'], exclude: [] } };

    expect(ui.sidebarCountMode).toBe('matching');
    expect(store.sidebarCounts.state.downloading).toBe(1);
    expect(store.sidebarCounts.state.stopped).toBe(0);
    expect(store.sidebarCounts.category.get('linux')).toBe(2);
    expect(store.sidebarCounts.total).toBe(1);
    expect(store.counts.state.stopped).toBe(1);
    expect(store.counts.total).toBe(3);

    ui.search = 'alpha';
    expect(store.sidebarCounts.total).toBe(0);
    expect(store.sidebarCounts.category.get('linux')).toBe(1);
    expect(store.sidebarCounts.category.get('movies')).toBe(0);
    expect(store.counts.category.get('movies')).toBe(1);
  });

  it('sidebarCounts equal the global counts in "all" mode', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.sidebarCountMode = 'all';
    ui.filters = { ...ui.filters, category: { include: ['movies'], exclude: [] } };
    ui.search = 'alpha';
    expect(store.sidebarCounts).toBe(store.counts);
    expect(store.sidebarCounts.state.stopped).toBe(1);

    ui.sidebarCountMode = 'matching';
    expect(store.sidebarCounts.state.stopped).toBe(0);
    expect(store.counts.state.stopped).toBe(1);
  });

  it('hashesMatchingOnly ignores the active sidebar filters and search', () => {
    const store = seedMixed();
    const ui = useUiStore();
    ui.filters = { ...ui.filters, category: { include: ['movies'], exclude: [] } };
    ui.search = 'beta';
    expect(store.hashesMatchingOnly('category', 'linux').sort()).toEqual(['a', 'c']);
    expect(store.hashesMatchingOnly('state', 'downloading')).toEqual(['b']);
  });

  it('hashesMatchingOnly includes subcategory descendants only when subcategories are enabled', () => {
    const store = useTorrentsStore();
    store.apply({
      rid: 1,
      full_update: true,
      server_state: { use_subcategories: true },
      torrents: { a: raw('a', { category: 'tv' }), b: raw('b', { category: 'tv/anime' }) },
    });
    expect(store.hashesMatchingOnly('category', 'tv').sort()).toEqual(['a', 'b']);
    store.apply({ rid: 2, server_state: { use_subcategories: false } });
    expect(store.hashesMatchingOnly('category', 'tv')).toEqual(['a']);
  });

  it('prunes selected torrents that a filter change hides', async () => {
    const store = seedMixed();
    const ui = useUiStore();
    const selection = useSelectionStore();
    selection.selectAll(store.filteredSorted);
    ui.filters = { ...ui.filters, category: { include: ['linux'], exclude: [] } };
    expect([...selection.selected].sort()).toEqual(['a', 'c']);
  });

  it('prunes a selected torrent that changes and drops out of the filtered view', () => {
    const store = seedMixed();
    const ui = useUiStore();
    const selection = useSelectionStore();
    ui.filters = { ...ui.filters, state: { include: ['downloading', 'stopped'], exclude: [] } };
    selection.selectAll(store.filteredSorted); // b, c
    store.apply({ rid: 2, torrents: { b: { state: 'stalledUP' as RawTorrent['state'] } } });
    expect([...selection.selected]).toEqual(['c']);
  });
});
