import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { emptyFilters, UNCATEGORIZED, UNTAGGED } from '@/lib/torrentFilters';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { cheatSheetEntries } from './engine';
import { FILTER_KEY_GROUPS, useFilterBindings } from './filterBindings';

const ctx = { count: null, extend: false, wasVisual: false };

function setup() {
  localStorage.clear();
  setActivePinia(createPinia());
  const torrents = useTorrentsStore();
  torrents.apply({
    rid: 1,
    full_update: true,
    torrents: { a: { ...DEFAULT_RAW_TORRENT, category: 'movies', tags: 'keep' } },
    categories: {
      tv: { name: 'tv', savePath: '' },
      movies: { name: 'movies', savePath: '' },
    },
    tags: ['keep', 'archive'],
  });
  return { ui: useUiStore(), bindings: useFilterBindings(), savedViews: useSavedViewsStore() };
}

let ctxs: ReturnType<typeof setup>;
beforeEach(() => {
  ctxs = setup();
});

const byKeys = (keys: string) => ctxs.bindings.value.find((b) => b.keys === keys)!;
const withPrefix = (prefix: string) => ctxs.bindings.value.filter((b) => b.keys.startsWith(prefix));

describe('filter key groups', () => {
  it('names every prefix the bindings use', () => {
    const keys = FILTER_KEY_GROUPS.map((g) => g.keys);
    expect(keys).toEqual(expect.arrayContaining(['f', 'fs', 'fc', 'ft', 'fr', "'"]));
  });

  it('puts the group entries into the cheat sheet', () => {
    const entries = cheatSheetEntries([{ bindings: [], groups: FILTER_KEY_GROUPS }]);
    expect(entries.map((e) => e.label)).toContain('Toggle a status filter');
  });
});

describe('status bindings', () => {
  it('toggles a state filter on and off and marks it applied', () => {
    const downloading = byKeys('fsd');
    expect(downloading.label).toBe('Downloading');
    downloading.run(ctx);
    expect(ctxs.ui.filters.state.include).toEqual(['downloading']);
    expect(byKeys('fsd').label).toBe('Downloading ✓');
    byKeys('fsd').run(ctx);
    expect(ctxs.ui.filters.state.include).toEqual([]);
  });

  it('toggles single-valued activity and completion filters', () => {
    const activity = withPrefix('fs').find((b) => b.label.startsWith('Active'))!;
    activity.run(ctx);
    expect(ctxs.ui.filters.activity).toBe('active');
    withPrefix('fs')
      .find((b) => b.label.startsWith('Active'))!
      .run(ctx);
    expect(ctxs.ui.filters.activity).toBeNull();
    const complete = withPrefix('fs').find((b) => /^Complete/.test(b.label))!;
    complete.run(ctx);
    expect(ctxs.ui.filters.completion).toBe('complete');
  });

  it('gives every status a unique key', () => {
    const keys = withPrefix('fs').map((b) => b.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('category, tag and tracker bindings', () => {
  it('lists uncategorized first, then categories sorted by name', () => {
    expect(withPrefix('fc').map((b) => b.label)).toEqual(['Uncategorized', 'movies', 'tv']);
    byKeys('fcu').run(ctx);
    expect(ctxs.ui.filters.category.include).toEqual([UNCATEGORIZED]);
    byKeys('fcm').run(ctx);
    expect(ctxs.ui.filters.category.include).toEqual([UNCATEGORIZED, 'movies']);
  });

  it('lists untagged first, then sorted tags', () => {
    expect(withPrefix('ft').map((b) => b.label)).toEqual(['Untagged', 'archive', 'keep']);
    byKeys('ftu').run(ctx);
    expect(ctxs.ui.filters.tag.include).toEqual([UNTAGGED]);
  });

  it('offers trackerless even with no trackers', () => {
    expect(withPrefix('fr').map((b) => b.label)).toEqual(['Trackerless']);
  });

  it('refreshes when the underlying data changes', () => {
    useTorrentsStore().apply({
      rid: 2,
      tags: ['zebra'],
    });
    expect(withPrefix('ft').map((b) => b.label)).toContain('zebra');
  });
});

describe('clear all filters', () => {
  it('is disabled with nothing applied and enabled with a filter or search', () => {
    const clear = () => byKeys('fx');
    expect(clear().isEnabled!()).toBe(false);
    ctxs.ui.search = 'abc';
    expect(clear().isEnabled!()).toBe(true);
    ctxs.ui.search = '';
    byKeys('fsd').run(ctx);
    expect(clear().isEnabled!()).toBe(true);
  });

  it('resets filters and search', () => {
    byKeys('fsd').run(ctx);
    ctxs.ui.search = 'abc';
    byKeys('fx').run(ctx);
    expect(ctxs.ui.filters).toEqual(emptyFilters());
    expect(ctxs.ui.search).toBe('');
  });
});

describe('saved views', () => {
  it('binds saved views under the apostrophe prefix and toggles them', () => {
    ctxs.savedViews.views = [
      {
        id: 'v1',
        name: 'Keepers',
        filters: { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } },
      },
    ];
    const view = withPrefix("'");
    expect(view.map((b) => b.label)).toEqual(['Keepers']);
    view[0]!.run(ctx);
    expect(ctxs.ui.filters.tag.include).toEqual(['keep']);
    expect(withPrefix("'")[0]!.label).toBe('Keepers ✓');
    withPrefix("'")[0]!.run(ctx);
    expect(ctxs.ui.filters).toEqual(emptyFilters());
  });
});
