import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { TorrentState } from '@/constants/qbit';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import Sidebar from './Sidebar.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    torrents: {
      a: { ...DEFAULT_RAW_TORRENT, category: 'linux', tags: 'iso', state: TorrentState.StalledUP },
      b: { ...DEFAULT_RAW_TORRENT, state: TorrentState.Downloading },
    },
    categories: { linux: { name: 'linux', savePath: '' } },
    tags: ['iso'],
  });
  useUiStore().collapsedSidebarKeys = [];
});

type Wrapper = ReturnType<typeof mount>;

let mounted: VueWrapper | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

function mountSidebar(options: { attachTo?: HTMLElement } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: {} }],
  });
  mounted = mount(Sidebar, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient() }]] },
    ...options,
  });
  return mounted;
}

const labelOf = (button: { text(): string }) => button.text().replace(/\s*excluded$/, '');
const findItem = (w: Wrapper, label: string) =>
  w.findAll('nav li button[aria-describedby]').find((b) => labelOf(b) === label);
const item = (w: Wrapper, label: string) => findItem(w, label)!;
const countOf = (w: Wrapper, label: string) =>
  w.get(`[id="${item(w, label).attributes('aria-describedby')}"]`).text();
const excludeButton = (w: Wrapper, label: string) => w.get(`[aria-label="Exclude ${label}"]`);
const sectionTitle = (w: Wrapper, title: string) =>
  w.findAll('h2 button').find((b) => b.text() === title)!;
const radioGroup = (w: Wrapper, group: 'Activity' | 'Completion') =>
  w.get(`[role="radiogroup"][aria-label="${group}"]`);
const radioOption = (w: Wrapper, group: 'Activity' | 'Completion', label: string) =>
  radioGroup(w, group)
    .findAll('[role="radio"]')
    .find((b) => b.text() === label)!;
const activityOption = (w: Wrapper, label: string) => radioOption(w, 'Activity', label);
const completionOption = (w: Wrapper, label: string) => radioOption(w, 'Completion', label);

async function chooseFromContextMenu(w: Wrapper, rowLabel: string, menuLabel: string) {
  await item(w, rowLabel).trigger('contextmenu');
  await flushPromises();
  const menuItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === menuLabel,
  );
  expect(menuItem, `menu item "${menuLabel}"`).toBeDefined();
  menuItem!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  (menuItem as HTMLElement).click();
  await flushPromises();
}

const pad = (n: number) => String(n).padStart(2, '0');
const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

function seedLongTagList() {
  const torrents: Record<string, typeof DEFAULT_RAW_TORRENT> = {};
  for (const n of range(14)) {
    const copies = n <= 10 ? 2 : 1;
    const state = n <= 10 ? TorrentState.StalledUP : TorrentState.Downloading;
    for (const copy of range(copies)) {
      torrents[`tag${n}-${copy}`] = { ...DEFAULT_RAW_TORRENT, tags: `tag-${pad(n)}`, state };
    }
  }
  useTorrentsStore().apply({ rid: 2, torrents });
}

function seedLongCategoryTree() {
  const torrents: Record<string, typeof DEFAULT_RAW_TORRENT> = {};
  const categories: Record<string, { name: string; savePath: string }> = {
    tv: { name: 'tv', savePath: '' },
    'tv/anime': { name: 'tv/anime', savePath: '' },
  };
  for (const n of range(12)) {
    const name = `cat-${pad(n)}`;
    categories[name] = { name, savePath: '' };
    torrents[`${name}-1`] = { ...DEFAULT_RAW_TORRENT, category: name };
    torrents[`${name}-2`] = { ...DEFAULT_RAW_TORRENT, category: name };
  }
  torrents['anime-1'] = { ...DEFAULT_RAW_TORRENT, category: 'tv/anime' };
  useTorrentsStore().apply({
    rid: 2,
    server_state: { use_subcategories: true },
    torrents,
    categories,
  });
}

const shownTags = (w: Wrapper) =>
  w
    .findAll('nav li button[aria-describedby]')
    .map(labelOf)
    .filter((label) => label.startsWith('tag-'));
const findButton = (w: Wrapper, title: string) => w.find(`button[aria-label="Find in ${title}"]`);
const findInput = (w: Wrapper, title: string) => w.find(`input[aria-label="Find in ${title}"]`);
const showAllButton = (w: Wrapper) =>
  w.findAll('button').find((b) => /^Show (all|fewer)/.test(b.text()));

describe('Sidebar', () => {
  it('collapses Trackers and Locations by default for a fresh install', () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const ui = useUiStore();
    expect(ui.collapsedSidebarKeys).toEqual(['trackers', 'locations']);
    expect(ui.showAllSidebarSections).toEqual([]);
    const w = mountSidebar();
    expect(sectionTitle(w, 'Trackers').attributes('aria-expanded')).toBe('false');
    expect(sectionTitle(w, 'Categories').attributes('aria-expanded')).toBe('true');
  });

  it('shows live counts and no "All" row', () => {
    const w = mountSidebar();
    expect(countOf(w, 'Downloading')).toBe('1');
    expect(countOf(w, 'Seeding')).toBe('1');
    expect(countOf(w, 'Stopped')).toBe('0');
    expect(countOf(w, 'linux')).toBe('1');
    expect(countOf(w, 'Uncategorized')).toBe('1');
    expect(countOf(w, 'Untagged')).toBe('1');
    expect(findItem(w, 'All')).toBeUndefined();
  });

  it('click includes, and clicking a marked row clears it', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    await item(w, 'linux').trigger('click');
    expect(ui.filters.category).toEqual({ include: ['linux'], exclude: [] });
    expect(item(w, 'linux').attributes('aria-pressed')).toBe('true');
    await item(w, 'linux').trigger('click');
    expect(ui.filters.category).toEqual({ include: [], exclude: [] });

    ui.filters = { ...ui.filters, category: { include: [], exclude: ['linux'] } };
    await flushPromises();
    await item(w, 'linux').trigger('click');
    expect(ui.filters.category).toEqual({ include: [], exclude: [] });
  });

  it.each(['ctrlKey', 'metaKey'] as const)('%s+click toggles exclude', async (modifier) => {
    const w = mountSidebar();
    const ui = useUiStore();
    await item(w, 'Seeding').trigger('click', { [modifier]: true });
    expect(ui.filters.state).toEqual({ include: [], exclude: ['seeding'] });
    expect(item(w, 'Seeding').attributes('aria-pressed')).toBe('mixed');
    expect(item(w, 'Seeding').text()).toContain('excluded');
    await item(w, 'Seeding').trigger('click', { [modifier]: true });
    expect(ui.filters.state).toEqual({ include: [], exclude: [] });
  });

  it('the exclude button toggles exclude and stays visible while excluded', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    await item(w, 'iso').trigger('click');
    expect(excludeButton(w, 'iso').classes()).toContain('opacity-0');
    await excludeButton(w, 'iso').trigger('click');
    expect(ui.filters.tag).toEqual({ include: [], exclude: ['iso'] });
    expect(excludeButton(w, 'iso').attributes('aria-pressed')).toBe('true');
    expect(excludeButton(w, 'iso').classes()).not.toContain('opacity-0');
    await excludeButton(w, 'iso').trigger('click');
    expect(ui.filters.tag).toEqual({ include: [], exclude: [] });
  });

  it('context menu: Show only this, Exclude, Include and Clear', async () => {
    const ui = useUiStore();
    ui.filters = { ...ui.filters, state: { include: ['downloading'], exclude: ['stopped'] } };
    const w = mountSidebar({ attachTo: document.body });

    await chooseFromContextMenu(w, 'Seeding', 'Show only this');
    expect(ui.filters.state).toEqual({ include: ['seeding'], exclude: [] });

    await chooseFromContextMenu(w, 'Seeding', 'Exclude');
    expect(ui.filters.state).toEqual({ include: [], exclude: ['seeding'] });

    await chooseFromContextMenu(w, 'Seeding', 'Include');
    expect(ui.filters.state).toEqual({ include: ['seeding'], exclude: [] });

    await chooseFromContextMenu(w, 'Seeding', 'Clear');
    expect(ui.filters.state).toEqual({ include: [], exclude: [] });
  });

  it('shows a Clear link for an active group', async () => {
    const w = mountSidebar();
    await item(w, 'iso').trigger('click');
    const clear = w.findAll('button').find((b) => b.text() === 'Clear')!;
    await clear.trigger('click');
    expect(useUiStore().filters.tag).toEqual({ include: [], exclude: [] });
  });

  it('Activity is single-select, Any clears it, and Status Clear resets it', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    expect(activityOption(w, 'Any').attributes('aria-checked')).toBe('true');
    await activityOption(w, 'Stalled').trigger('click');
    expect(ui.filters.activity).toBe('stalled');
    expect(activityOption(w, 'Stalled').attributes('aria-checked')).toBe('true');
    expect(activityOption(w, 'Any').attributes('aria-checked')).toBe('false');
    expect(useTorrentsStore().filteredSorted.map((t) => t.hash)).toEqual(['a']);

    await activityOption(w, 'Any').trigger('click');
    expect(ui.filters.activity).toBeNull();

    await activityOption(w, 'Idle').trigger('click');
    await item(w, 'Seeding').trigger('click');
    const clear = w.findAll('button').find((b) => b.text() === 'Clear')!;
    await clear.trigger('click');
    expect(ui.filters.activity).toBeNull();
    expect(ui.filters.state).toEqual({ include: [], exclude: [] });
  });

  it('arrow keys move the Activity selection', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    const group = radioGroup(w, 'Activity');
    await group.trigger('keydown', { key: 'ArrowRight' });
    expect(ui.filters.activity).toBe('active');
    await group.trigger('keydown', { key: 'ArrowLeft' });
    await group.trigger('keydown', { key: 'ArrowLeft' });
    expect(ui.filters.activity).toBe('idle');
  });

  it('renders Activity and Completion as two separate radiogroups, Completion second', () => {
    const w = mountSidebar();
    const groups = w.findAll('[role="radiogroup"]');
    expect(groups.map((g) => g.attributes('aria-label'))).toEqual(['Activity', 'Completion']);
    expect(groups[1]!.findAll('[role="radio"]').map((b) => b.text())).toEqual([
      'Any',
      'Incomplete',
      'Complete',
    ]);
  });

  it('Completion is single-select, independent of Activity, and Any clears it', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    useTorrentsStore().apply({ rid: 2, torrents: { a: { progress: 1 } } });
    await flushPromises();
    expect(completionOption(w, 'Any').attributes('aria-checked')).toBe('true');

    await completionOption(w, 'Complete').trigger('click');
    expect(ui.filters.completion).toBe('complete');
    expect(ui.filters.activity).toBeNull();
    expect(completionOption(w, 'Complete').attributes('aria-checked')).toBe('true');
    expect(completionOption(w, 'Any').attributes('aria-checked')).toBe('false');
    expect(activityOption(w, 'Any').attributes('aria-checked')).toBe('true');
    expect(useTorrentsStore().filteredSorted.map((t) => t.hash)).toEqual(['a']);

    await completionOption(w, 'Incomplete').trigger('click');
    expect(ui.filters.completion).toBe('incomplete');
    expect(useTorrentsStore().filteredSorted.map((t) => t.hash)).toEqual(['b']);

    await completionOption(w, 'Any').trigger('click');
    expect(ui.filters.completion).toBeNull();
  });

  it('arrow keys move the Completion selection without touching Activity', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    const group = radioGroup(w, 'Completion');
    await group.trigger('keydown', { key: 'ArrowRight' });
    expect(ui.filters.completion).toBe('incomplete');
    await group.trigger('keydown', { key: 'ArrowRight' });
    expect(ui.filters.completion).toBe('complete');
    await group.trigger('keydown', { key: 'ArrowRight' });
    expect(ui.filters.completion).toBeNull();
    expect(ui.filters.activity).toBeNull();
  });

  it('Status Clear resets completion along with state and activity', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    await completionOption(w, 'Complete').trigger('click');
    await activityOption(w, 'Idle').trigger('click');
    await item(w, 'Seeding').trigger('click');
    await w
      .findAll('button')
      .find((b) => b.text() === 'Clear')!
      .trigger('click');
    expect(ui.filters.completion).toBeNull();
    expect(ui.filters.activity).toBeNull();
    expect(ui.filters.state).toEqual({ include: [], exclude: [] });
  });

  it('shows a Clear link when only completion is set', async () => {
    const w = mountSidebar();
    await completionOption(w, 'Complete').trigger('click');
    expect(w.findAll('button').some((b) => b.text() === 'Clear')).toBe(true);
  });

  it('hides empty Checking, Moving and Errored rows', () => {
    const w = mountSidebar();
    for (const label of ['Checking', 'Moving', 'Errored']) {
      expect(findItem(w, label), label).toBeUndefined();
    }
  });

  it('shows hidden-when-empty state rows once they have torrents', () => {
    useTorrentsStore().apply({
      rid: 2,
      torrents: {
        c: { ...DEFAULT_RAW_TORRENT, state: TorrentState.CheckingUP },
        d: { ...DEFAULT_RAW_TORRENT, state: TorrentState.Moving },
        e: { ...DEFAULT_RAW_TORRENT, state: TorrentState.Error },
      },
    });
    const w = mountSidebar();
    for (const label of ['Checking', 'Moving', 'Errored']) {
      expect(countOf(w, label)).toBe('1');
    }
  });

  it('keeps an empty state row visible while it is being filtered on', async () => {
    const ui = useUiStore();
    ui.filters = { ...ui.filters, state: { include: [], exclude: ['errored'] } };
    const w = mountSidebar();
    expect(item(w, 'Errored').attributes('aria-pressed')).toBe('mixed');
  });

  it('shows how many filters are active in a collapsed section header', async () => {
    const ui = useUiStore();
    ui.filters = {
      ...ui.filters,
      state: { include: ['seeding'], exclude: [] },
      activity: 'stalled',
    };
    const w = mountSidebar();
    expect(sectionTitle(w, 'Status')).toBeDefined();
    await sectionTitle(w, 'Status').trigger('click');
    const collapsedTitle = w.findAll('h2 button').find((b) => b.text().startsWith('Status'))!;
    expect(collapsedTitle.text()).toBe('Status2 active');
  });

  it('counts completion in the collapsed Status section header', async () => {
    const ui = useUiStore();
    ui.filters = {
      ...ui.filters,
      state: { include: ['seeding'], exclude: [] },
      activity: 'stalled',
      completion: 'complete',
    };
    const w = mountSidebar();
    await sectionTitle(w, 'Status').trigger('click');
    const collapsedTitle = w.findAll('h2 button').find((b) => b.text().startsWith('Status'))!;
    expect(collapsedTitle.text()).toBe('Status3 active');

    ui.filters = {
      ...ui.filters,
      state: { include: [], exclude: [] },
      activity: null,
      completion: 'incomplete',
    };
    await flushPromises();
    expect(collapsedTitle.text()).toBe('Status1 active');
  });

  it('hides Untagged, Uncategorized and Trackerless at zero unless marked', async () => {
    useTorrentsStore().apply({
      rid: 2,
      torrents: { b: { ...DEFAULT_RAW_TORRENT, category: 'linux', tags: 'iso' } },
      trackers: { 'https://t.example/announce': ['a', 'b'] },
    });
    const w = mountSidebar();
    expect(findItem(w, 'Uncategorized')).toBeUndefined();
    expect(findItem(w, 'Untagged')).toBeUndefined();
    expect(findItem(w, 'Trackerless')).toBeUndefined();

    const ui = useUiStore();
    ui.filters = {
      ...ui.filters,
      category: { include: [''], exclude: [] },
      tag: { include: [''], exclude: [] },
      tracker: { include: [''], exclude: [] },
    };
    await flushPromises();
    expect(item(w, 'Uncategorized').attributes('aria-pressed')).toBe('true');
    expect(item(w, 'Untagged').attributes('aria-pressed')).toBe('true');
    expect(item(w, 'Trackerless').attributes('aria-pressed')).toBe('true');
  });

  it('collapsing a section hides its rows and persists the collapsed key', async () => {
    const w = mountSidebar();
    const ui = useUiStore();
    expect(findItem(w, 'linux')).toBeDefined();
    await sectionTitle(w, 'Categories').trigger('click');
    expect(findItem(w, 'linux')).toBeUndefined();
    expect(findItem(w, 'Seeding')).toBeDefined();
    expect(ui.collapsedSidebarKeys).toContain('categories');
    expect(
      JSON.parse(
        localStorage.getItem(
          Object.keys(localStorage).find((k) => k.endsWith('collapsedSidebarKeys'))!,
        )!,
      ),
    ).toContain('categories');

    await sectionTitle(w, 'Categories').trigger('click');
    expect(findItem(w, 'linux')).toBeDefined();
    expect(ui.collapsedSidebarKeys).not.toContain('categories');
  });

  describe('faceted counts', () => {
    beforeEach(() => {
      useTorrentsStore().apply({
        rid: 2,
        torrents: {
          c: {
            ...DEFAULT_RAW_TORRENT,
            category: 'linux',
            state: TorrentState.StoppedDL,
          },
          d: { ...DEFAULT_RAW_TORRENT, state: TorrentState.Error },
        },
      });
    });

    it('shows counts that apply the other filters, not the group own filter', async () => {
      const ui = useUiStore();
      ui.filters = { ...ui.filters, category: { include: ['linux'], exclude: [] } };
      const w = mountSidebar();
      expect(countOf(w, 'linux')).toBe('2');
      expect(countOf(w, 'Uncategorized')).toBe('2');
      expect(countOf(w, 'Seeding')).toBe('1');
      expect(countOf(w, 'Stopped')).toBe('1');
      expect(countOf(w, 'Downloading')).toBe('0');
      expect(activityOption(w, 'Any').attributes('data-tooltip')).toBe('Any: 2 torrents');
      expect(activityOption(w, 'Stalled').attributes('data-tooltip')).toBe('Stalled: 1 torrents');
    });

    it('keeps a globally non-empty row visible and dimmed at a faceted zero', () => {
      const ui = useUiStore();
      ui.filters = { ...ui.filters, tag: { include: ['iso'], exclude: [] } };
      const w = mountSidebar();
      expect(countOf(w, 'Errored')).toBe('0');
      expect(item(w, 'Errored').classes()).toContain('opacity-50');
      expect(countOf(w, 'Uncategorized')).toBe('0');
      expect(item(w, 'Uncategorized').classes()).toContain('opacity-50');
      expect(countOf(w, 'Seeding')).toBe('1');
      expect(item(w, 'Seeding').classes()).not.toContain('opacity-50');
      expect(findItem(w, 'Checking')).toBeUndefined();
    });

    it('keeps Untagged and Trackerless rows when a filter zeroes them', () => {
      useTorrentsStore().apply({
        rid: 3,
        trackers: { 'https://t.example/announce': ['a'] },
      });
      const ui = useUiStore();
      ui.filters = { ...ui.filters, category: { include: ['linux'], exclude: [] } };
      ui.search = 'nomatch';
      const w = mountSidebar();
      expect(countOf(w, 'Untagged')).toBe('0');
      expect(countOf(w, 'Trackerless')).toBe('0');
      expect(item(w, 'Untagged').classes()).toContain('opacity-50');
      expect(item(w, 'Trackerless').classes()).toContain('opacity-50');
    });

    it('does not dim a marked row at zero', () => {
      const ui = useUiStore();
      ui.filters = {
        ...ui.filters,
        tag: { include: ['iso'], exclude: [] },
        state: { include: [], exclude: ['errored'] },
        category: { include: [''], exclude: [] },
      };
      const w = mountSidebar();
      expect(countOf(w, 'Uncategorized')).toBe('0');
      expect(item(w, 'Uncategorized').classes()).not.toContain('opacity-50');
    });

    it('shows faceted Completion counts and dims empty options unless selected', async () => {
      useTorrentsStore().apply({ rid: 2, torrents: { a: { progress: 1 } } });
      const ui = useUiStore();
      ui.filters = { ...ui.filters, state: { include: ['downloading'], exclude: [] } };
      const w = mountSidebar();
      expect(completionOption(w, 'Any').attributes('data-tooltip')).toBe('Any: 1 torrents');
      expect(completionOption(w, 'Incomplete').attributes('data-tooltip')).toBe(
        'Incomplete: 1 torrents',
      );
      expect(completionOption(w, 'Complete').attributes('data-tooltip')).toBe(
        'Complete: 0 torrents',
      );
      expect(completionOption(w, 'Complete').classes()).toContain('opacity-50');
      expect(completionOption(w, 'Incomplete').classes()).not.toContain('opacity-50');
      await completionOption(w, 'Complete').trigger('click');
      expect(completionOption(w, 'Complete').classes()).not.toContain('opacity-50');
    });

    it('dims Activity options at zero unless selected', async () => {
      const ui = useUiStore();
      ui.filters = { ...ui.filters, state: { include: ['downloading'], exclude: [] } };
      const w = mountSidebar();
      expect(activityOption(w, 'Active').attributes('data-tooltip')).toBe('Active: 0 torrents');
      expect(activityOption(w, 'Idle').attributes('data-tooltip')).toBe('Idle: 1 torrents');
      expect(activityOption(w, 'Active').classes()).toContain('opacity-50');
      expect(activityOption(w, 'Idle').classes()).not.toContain('opacity-50');
      await activityOption(w, 'Active').trigger('click');
      expect(activityOption(w, 'Active').classes()).not.toContain('opacity-50');
    });

    it('shows global counts in "all" mode', () => {
      const ui = useUiStore();
      ui.sidebarCountMode = 'all';
      ui.filters = { ...ui.filters, category: { include: ['linux'], exclude: [] } };
      ui.search = 'nomatch';
      const w = mountSidebar();
      expect(countOf(w, 'Uncategorized')).toBe('2');
      expect(countOf(w, 'Seeding')).toBe('1');
      expect(item(w, 'Seeding').classes()).not.toContain('opacity-50');
    });
  });

  describe('with subcategories', () => {
    beforeEach(() => {
      useTorrentsStore().apply({
        rid: 2,
        server_state: { use_subcategories: true },
        torrents: {
          c: { ...DEFAULT_RAW_TORRENT, category: 'tv' },
          d: { ...DEFAULT_RAW_TORRENT, category: 'tv/anime' },
        },
        categories: {
          tv: { name: 'tv', savePath: '' },
          'tv/anime': { name: 'tv/anime', savePath: '' },
        },
      });
    });

    it('nests children under their parent, whose count includes them', () => {
      const w = mountSidebar();
      expect(countOf(w, 'tv')).toBe('2');
      expect(countOf(w, 'anime')).toBe('1');
      expect(w.find('[aria-label="Collapse tv"]').exists()).toBe(true);
    });

    it('collapses and expands a parent', async () => {
      const w = mountSidebar();
      await w.get('[aria-label="Collapse tv"]').trigger('click');
      expect(findItem(w, 'anime')).toBeUndefined();
      expect(useUiStore().collapsedSidebarKeys).toContain('category:tv');
      await w.get('[aria-label="Expand tv"]').trigger('click');
      expect(findItem(w, 'anime')).toBeDefined();
    });

    it('filters a parent category to include its subcategories', async () => {
      const w = mountSidebar();
      await item(w, 'tv').trigger('click');
      const shown = useTorrentsStore()
        .filteredSorted.map((t) => t.category)
        .sort();
      expect(shown).toEqual(['tv', 'tv/anime']);
    });
  });

  describe('locations', () => {
    beforeEach(() => {
      useTorrentsStore().apply({
        rid: 2,
        torrents: {
          c: { ...DEFAULT_RAW_TORRENT, save_path: '/data/linux', size: 1024 },
          d: { ...DEFAULT_RAW_TORRENT, save_path: '/data/movies', size: 2048 },
        },
      });
    });

    it('renders a folded root with one child per save path', () => {
      const w = mountSidebar();
      expect(countOf(w, '/data')).toBe('2');
      expect(item(w, 'movies').get('[data-tooltip]').attributes('data-tooltip')).toBe(
        'movies\n2.00 KiB',
      );
    });

    it('sets the location filter when a location is clicked', async () => {
      const w = mountSidebar();
      const locations = w
        .findAll('section')
        .find((x) => x.find('h2').exists() && x.get('h2').text() === 'Locations')!;
      await locations
        .findAll('button[aria-describedby]')
        .find((b) => labelOf(b) === 'linux')!
        .trigger('click');
      expect(useUiStore().filters.location).toEqual({ include: ['/data/linux'], exclude: [] });
      expect(useTorrentsStore().filteredSorted.map((t) => t.hash)).toEqual(['c']);
    });

    it('has no Locations section when no torrent has a save path', () => {
      setActivePinia(createPinia());
      const w = mountSidebar();
      expect(sectionTitle(w, 'Locations')).toBeUndefined();
    });
  });

  describe('long sections', () => {
    describe('trimming', () => {
      beforeEach(seedLongTagList);

      it('shows the 10 busiest tags, then all of them via Show all, and persists the choice', async () => {
        const w = mountSidebar();
        expect(shownTags(w)).toEqual(range(10).map((n) => `tag-${pad(n)}`));
        expect(findItem(w, 'iso')).toBeUndefined();
        expect(showAllButton(w)!.text()).toBe('Show all (15)');

        await showAllButton(w)!.trigger('click');
        expect(shownTags(w)).toHaveLength(14);
        expect(findItem(w, 'iso')).toBeDefined();
        expect(showAllButton(w)!.text()).toBe('Show fewer');
        expect(useUiStore().showAllSidebarSections).toEqual(['tags']);
        expect(
          JSON.parse(
            localStorage.getItem(
              Object.keys(localStorage).find((k) => k.endsWith('showAllSidebarSections'))!,
            )!,
          ),
        ).toEqual(['tags']);

        await showAllButton(w)!.trigger('click');
        expect(shownTags(w)).toHaveLength(10);
        expect(useUiStore().showAllSidebarSections).toEqual([]);
      });

      it('restores the Show all choice on the next mount', () => {
        useUiStore().showAllSidebarSections = ['tags'];
        const w = mountSidebar();
        expect(shownTags(w)).toHaveLength(14);
        expect(showAllButton(w)!.text()).toBe('Show fewer');
      });

      it('keeps marked rows that fall outside the top 10', async () => {
        const ui = useUiStore();
        ui.filters = { ...ui.filters, tag: { include: [], exclude: ['tag-14'] } };
        const w = mountSidebar();
        expect(shownTags(w)).toEqual([...range(10).map((n) => `tag-${pad(n)}`), 'tag-14']);
        expect(item(w, 'tag-14').attributes('aria-pressed')).toBe('mixed');
      });

      it('has no Show all button when marked rows leave nothing hidden', () => {
        const ui = useUiStore();
        ui.filters = {
          ...ui.filters,
          tag: { include: ['tag-11', 'tag-12'], exclude: ['tag-13', 'tag-14', 'iso'] },
        };
        const w = mountSidebar();
        expect(shownTags(w)).toHaveLength(14);
        expect(findItem(w, 'iso')).toBeDefined();
        expect(showAllButton(w)).toBeUndefined();
      });

      it('picks the top 10 from global counts, not the faceted counts', () => {
        const ui = useUiStore();
        ui.filters = { ...ui.filters, state: { include: ['downloading'], exclude: [] } };
        const w = mountSidebar();
        expect(countOf(w, 'tag-01')).toBe('0');
        expect(findItem(w, 'tag-11')).toBeUndefined();
        expect(shownTags(w)).toEqual(range(10).map((n) => `tag-${pad(n)}`));
      });
    });

    it('neither trims nor offers find at exactly 12 rows', () => {
      const torrents: Record<string, typeof DEFAULT_RAW_TORRENT> = {};
      for (const n of range(11)) {
        torrents[`t${n}`] = { ...DEFAULT_RAW_TORRENT, tags: `tag-${pad(n)}` };
      }
      useTorrentsStore().apply({ rid: 2, torrents });
      const w = mountSidebar();
      expect(shownTags(w)).toHaveLength(11);
      expect(findItem(w, 'iso')).toBeDefined();
      expect(showAllButton(w)).toBeUndefined();
      expect(findButton(w, 'Tags').exists()).toBe(false);
    });

    describe('trimming trees', () => {
      beforeEach(seedLongCategoryTree);

      it('trims top-level nodes and counts Show all by top-level rows', () => {
        const w = mountSidebar();
        expect(findItem(w, 'tv')).toBeUndefined();
        expect(findItem(w, 'cat-10')).toBeDefined();
        expect(findItem(w, 'cat-11')).toBeUndefined();
        expect(showAllButton(w)!.text()).toBe('Show all (14)');
      });

      it('keeps a root when a node beneath it is marked', () => {
        const ui = useUiStore();
        ui.filters = { ...ui.filters, category: { include: ['tv/anime'], exclude: [] } };
        const w = mountSidebar();
        expect(findItem(w, 'tv')).toBeDefined();
        expect(findItem(w, 'anime')).toBeDefined();
        expect(findItem(w, 'linux')).toBeUndefined();
      });
    });

    describe('quick find', () => {
      beforeEach(seedLongTagList);

      it('shows a search button only for long sections', () => {
        const w = mountSidebar();
        expect(findButton(w, 'Tags').exists()).toBe(true);
        expect(findButton(w, 'Categories').exists()).toBe(false);
        expect(findButton(w, 'Trackers').exists()).toBe(false);
      });

      it('does not show the search button while the section is collapsed', async () => {
        const w = mountSidebar();
        await sectionTitle(w, 'Tags').trigger('click');
        expect(findButton(w, 'Tags').exists()).toBe(false);
      });

      it('opens an input in place of the title and filters case-insensitively', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        const input = findInput(w, 'Tags');
        expect(input.exists()).toBe(true);
        expect(input.attributes('placeholder')).toBe('Find tags');
        expect(findButton(w, 'Tags').exists()).toBe(false);
        expect(sectionTitle(w, 'Tags')).toBeUndefined();

        await input.setValue('  TAG-1 ');
        expect(shownTags(w)).toEqual(['tag-10', 'tag-11', 'tag-12', 'tag-13', 'tag-14']);
        expect(showAllButton(w)).toBeUndefined();
      });

      it('shows every match, including ones that trimming would hide', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        await findInput(w, 'Tags').setValue('iso');
        expect(findItem(w, 'iso')).toBeDefined();
        expect(shownTags(w)).toEqual([]);
      });

      it('filters synthetic rows by their label while finding', async () => {
        const w = mountSidebar();
        expect(findItem(w, 'Untagged')).toBeDefined();
        await findButton(w, 'Tags').trigger('click');

        await findInput(w, 'Tags').setValue('tag-01');
        expect(findItem(w, 'Untagged')).toBeUndefined();

        await findInput(w, 'Tags').setValue('UNTAG');
        expect(findItem(w, 'Untagged')).toBeDefined();
        expect(shownTags(w)).toEqual([]);
        expect(w.text()).not.toContain('No matches');
      });

      it('shows No matches when nothing matches', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        await findInput(w, 'Tags').setValue('zzz');
        expect(w.text()).toContain('No matches');
        expect(findItem(w, 'Untagged')).toBeUndefined();
        expect(showAllButton(w)).toBeUndefined();
      });

      it('Escape clears the query, closes the input and restores the trimmed list', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        await findInput(w, 'Tags').setValue('zzz');
        await findInput(w, 'Tags').trigger('keydown', { key: 'Escape' });
        expect(findInput(w, 'Tags').exists()).toBe(false);
        expect(sectionTitle(w, 'Tags')).toBeDefined();
        expect(w.text()).not.toContain('No matches');
        expect(shownTags(w)).toHaveLength(10);
      });

      it('the Close find button closes and clears', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        await findInput(w, 'Tags').setValue('tag-1');
        await w.get('button[aria-label="Close find"]').trigger('click');
        expect(findInput(w, 'Tags').exists()).toBe(false);
        expect(shownTags(w)).toHaveLength(10);
      });

      it('closes on blur when empty but stays open when it has text', async () => {
        const w = mountSidebar();
        await findButton(w, 'Tags').trigger('click');
        await findInput(w, 'Tags').setValue('tag-1');
        await findInput(w, 'Tags').trigger('blur');
        expect(findInput(w, 'Tags').exists()).toBe(true);

        await findInput(w, 'Tags').setValue('');
        await findInput(w, 'Tags').trigger('blur');
        expect(findInput(w, 'Tags').exists()).toBe(false);
      });
    });

    describe('quick find in trees', () => {
      beforeEach(() => {
        seedLongCategoryTree();
        useUiStore().collapsedSidebarKeys = ['category:tv'];
      });

      it('shows a match inside a collapsed parent, with its ancestor and no chevrons', async () => {
        const w = mountSidebar();
        expect(findItem(w, 'anime')).toBeUndefined();
        await findButton(w, 'Categories').trigger('click');
        await findInput(w, 'Categories').setValue('ANIME');
        expect(findItem(w, 'tv')).toBeDefined();
        expect(findItem(w, 'anime')).toBeDefined();
        expect(findItem(w, 'cat-01')).toBeUndefined();
        expect(w.find('[aria-label="Expand tv"]').exists()).toBe(false);
        expect(w.find('[aria-label="Collapse tv"]').exists()).toBe(false);
        expect(useUiStore().collapsedSidebarKeys).toEqual(['category:tv']);
      });

      it('shows the whole subtree of a matching node, even when children do not match', async () => {
        const w = mountSidebar();
        await findButton(w, 'Categories').trigger('click');
        await findInput(w, 'Categories').setValue('tv');
        expect(findItem(w, 'tv')).toBeDefined();
        expect(findItem(w, 'anime')).toBeDefined();
        expect(findItem(w, 'cat-01')).toBeUndefined();
      });

      it('restores the collapsed parent after closing find', async () => {
        const w = mountSidebar();
        await findButton(w, 'Categories').trigger('click');
        await findInput(w, 'Categories').setValue('anime');
        await findInput(w, 'Categories').trigger('keydown', { key: 'Escape' });
        expect(findItem(w, 'anime')).toBeUndefined();
      });
    });
  });
});
