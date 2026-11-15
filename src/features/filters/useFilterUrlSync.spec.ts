import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { emptyFilters } from '@/lib/torrentFilters';
import { useUiStore } from '@/stores/ui';
import { useFilterUrlSync } from './useFilterUrlSync';

const SEARCH_DEBOUNCE_MS = 400;

const Host = defineComponent({
  setup() {
    useFilterUrlSync();
    return () => h('div', [h(RouterView)]);
  },
});
const Other = { render: () => h('div') };

let router: Router;
let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let wrappers: ReturnType<typeof mount>[];

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'main',
        component: Host,
        children: [{ path: 'settings', name: 'settings', component: Other }],
      },
    ],
  });
}

async function mountAt(url: string) {
  router = createTestRouter();
  await router.push(url);
  await router.isReady();
  pushSpy = vi.spyOn(router, 'push');
  replaceSpy = vi.spyOn(router, 'replace');
  const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const queryParam = () => router.currentRoute.value.query.q;
const ui = () => useUiStore();

async function settle() {
  await flushPromises();
}

async function advanceSearchDebounce() {
  await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10);
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setActivePinia(createPinia());
  wrappers = [];
});

afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  vi.useRealTimers();
});

describe('useFilterUrlSync: initial state', () => {
  it('applies a q in the URL over the store state', async () => {
    ui().filters = { ...emptyFilters(), tag: { include: ['old'], exclude: [] } };
    ui().search = 'old search';
    await mountAt('/?q=state:seeding+-tag:x+ratio>2+ubuntu');
    expect(ui().filters.state.include).toEqual(['seeding']);
    expect(ui().filters.tag).toEqual({ include: [], exclude: ['x'] });
    expect(ui().filters.conditions).toEqual([{ field: 'ratio', operator: '>', value: 2 }]);
    expect(ui().search).toBe('ubuntu');
  });

  it('writes the current state into the URL when there is no q', async () => {
    ui().filters = { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } };
    ui().search = 'abc';
    await mountAt('/');
    expect(queryParam()).toBe('tag:keep abc');
  });

  it('leaves the URL alone when there is nothing to mirror', async () => {
    await mountAt('/');
    expect(queryParam()).toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('does not add history entries for the initial write', async () => {
    ui().search = 'abc';
    await mountAt('/');
    expect(queryParam()).toBe('abc');
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledOnce();
  });

  it('clears the store when q is empty', async () => {
    ui().filters = { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } };
    await mountAt('/?q=');
    expect(ui().filters).toEqual(emptyFilters());
    expect(ui().search).toBe('');
  });

  it('preserves other query params', async () => {
    await mountAt('/?x=1');
    ui().filters = { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } };
    await settle();
    expect(router.currentRoute.value.query).toEqual({ x: '1', q: 'tag:keep' });
  });
});

describe('useFilterUrlSync: store to URL', () => {
  it('pushes a history entry for each filter change', async () => {
    await mountAt('/');
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await settle();
    expect(queryParam()).toBe('tag:a');
    ui().filters = { ...ui().filters, state: { include: ['seeding'], exclude: [] } };
    await settle();
    expect(queryParam()).toBe('state:seeding tag:a');

    await router.back();
    await settle();
    expect(queryParam()).toBe('tag:a');
    await router.back();
    await settle();
    expect(queryParam()).toBeUndefined();
  });

  it('pushes for in-place edits of the filters object', async () => {
    await mountAt('/');
    ui().filters.tag.include.push('a');
    await settle();
    expect(queryParam()).toBe('tag:a');
  });

  it('writes search changes with replace after the debounce', async () => {
    await mountAt('/');
    ui().search = 'ubu';
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);
    expect(queryParam()).toBeUndefined();
    ui().search = 'ubuntu';
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);
    expect(queryParam()).toBeUndefined();
    await advanceSearchDebounce();
    expect(queryParam()).toBe('ubuntu');

    ui().search = 'debian';
    await advanceSearchDebounce();
    expect(queryParam()).toBe('debian');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(2);
  });

  it('removes q when everything is cleared', async () => {
    await mountAt('/?q=tag:a+abc');
    ui().clearFilters();
    await settle();
    await advanceSearchDebounce();
    expect(queryParam()).toBeUndefined();
  });

  it('commits a typed token as one push without extra entries', async () => {
    await mountAt('/');
    ui().search = 'tag:a';
    ui().search = '';
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await settle();
    await advanceSearchDebounce();
    expect(queryParam()).toBe('tag:a');
    await router.back();
    await settle();
    expect(queryParam()).toBeUndefined();
    expect(ui().filters).toEqual(emptyFilters());
  });
});

describe('useFilterUrlSync: URL to store', () => {
  it('applies the route q on Back and Forward', async () => {
    await mountAt('/');
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await settle();
    ui().filters = { ...emptyFilters(), tag: { include: ['b'], exclude: [] }, activity: 'idle' };
    await settle();

    await router.back();
    await settle();
    expect(ui().filters.tag.include).toEqual(['a']);
    expect(ui().filters.activity).toBeNull();

    await router.forward();
    await settle();
    expect(ui().filters.tag.include).toEqual(['b']);
    expect(ui().filters.activity).toBe('idle');
  });

  it('applies the search text from the route', async () => {
    await mountAt('/');
    await router.push({ path: '/', query: { q: 'tag:a hello' } });
    await settle();
    expect(ui().filters.tag.include).toEqual(['a']);
    expect(ui().search).toBe('hello');
  });

  it('clears filters when navigating to a URL without q', async () => {
    await mountAt('/?q=tag:a');
    await router.push('/');
    await settle();
    expect(ui().filters).toEqual(emptyFilters());
    expect(ui().search).toBe('');
  });

  it('ignores a route that already matches the store', async () => {
    await mountAt('/');
    ui().search = 'abc';
    const before = ui().filters;
    await router.push({ path: '/', query: { q: 'abc' } });
    await settle();
    expect(ui().search).toBe('abc');
    expect(ui().filters).toBe(before);
  });

  it('ignores its own pending write landing after newer edits', async () => {
    await mountAt('/');
    ui().search = 'a';
    await advanceSearchDebounce();
    ui().search = 'ab';
    await advanceSearchDebounce();
    expect(ui().search).toBe('ab');
    expect(queryParam()).toBe('ab');
  });

  it('does not touch the URL or store on other routes', async () => {
    await mountAt('/');
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await settle();
    await router.push('/settings');
    await settle();
    ui().filters = { ...emptyFilters(), tag: { include: ['b'], exclude: [] } };
    await settle();
    ui().search = 'abc';
    await advanceSearchDebounce();
    expect(router.currentRoute.value.query.q).toBeUndefined();
    expect(ui().filters.tag.include).toEqual(['b']);
  });

  it('keeps the filters and restores q when coming back from settings to a bare /', async () => {
    await mountAt('/settings');
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await settle();
    await router.push('/');
    await settle();
    expect(ui().filters.tag.include).toEqual(['a']);
    expect(queryParam()).toBe('tag:a');
  });

  it('applies a q given when coming back from settings', async () => {
    await mountAt('/settings');
    ui().filters = { ...emptyFilters(), tag: { include: ['a'], exclude: [] } };
    await router.push('/?q=tag:b');
    await settle();
    expect(ui().filters.tag.include).toEqual(['b']);
  });
});

describe('useFilterUrlSync: canonicalization', () => {
  it('rewrites a hand-written URL in place with replace', async () => {
    await mountAt('/?q=ubuntu+status:seed+category:x+tag:a');
    expect(queryParam()).toBe('state:seeding cat:x tag:a ubuntu');
    expect(ui().filters.state.include).toEqual(['seeding']);
    expect(ui().search).toBe('ubuntu');

    ui().filters = { ...ui().filters, tag: { include: ['a', 'b'], exclude: [] } };
    await settle();
    await router.back();
    await settle();
    expect(queryParam()).toBe('state:seeding cat:x tag:a ubuntu');
  });

  it('does not leave the non-canonical URL behind for Back to bounce on', async () => {
    await mountAt('/?q=tag:a');
    await router.push({ path: '/', query: { q: 'tag:b' } });
    await settle();
    ui().filters = { ...emptyFilters(), tag: { include: ['b'], exclude: [] }, activity: 'idle' };
    await settle();
    await router.push({ path: '/', query: { q: 'activity:idle is:stalled' } });
    await settle();
    expect(queryParam()).toBe('activity:stalled');
    await router.back();
    await settle();
    expect(queryParam()).toBe('activity:idle tag:b');
  });

  it('round-trips completion through the URL', async () => {
    await mountAt('/?q=-is:complete+tag:a');
    expect(ui().filters.completion).toBe('incomplete');
    expect(ui().filters.tag.include).toEqual(['a']);
    expect(queryParam()).toBe('completion:incomplete tag:a');

    ui().filters = { ...emptyFilters(), completion: 'complete' };
    await settle();
    await advanceSearchDebounce();
    expect(queryParam()).toBe('completion:complete');
    await router.push({ path: '/', query: { q: 'is:incomplete' } });
    await settle();
    expect(ui().filters.completion).toBe('incomplete');
  });

  it('does not alter a canonical URL', async () => {
    await mountAt('/?q=state:seeding+tag:a+ratio>2+ubuntu');
    expect(queryParam()).toBe('state:seeding tag:a ratio>2 ubuntu');
  });

  it('normalizes sizes and ages to their compact form', async () => {
    await mountAt('/?q=size>1024M+added<2w');
    expect(queryParam()).toBe('size>1G added<14d');
  });

  it('round-trips quoted values', async () => {
    ui().filters = { ...emptyFilters(), tag: { include: ['my tag', ''], exclude: [] } };
    await mountAt('/');
    expect(queryParam()).toBe('tag:"my tag" tag:""');
    ui().filters = emptyFilters();
    await settle();
    await router.back();
    await settle();
    expect(ui().filters.tag.include).toEqual(['my tag', '']);
  });
});
