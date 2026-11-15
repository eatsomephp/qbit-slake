import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import type { SearchJob, SearchPlugin, SearchResult } from '@/types/app';

const qbit = vi.hoisted(() => ({
  getSearchJobs: vi.fn(),
  getSearchPlugins: vi.fn(),
  getSearchResults: vi.fn(),
  startSearch: vi.fn(),
  stopSearch: vi.fn(),
  deleteSearch: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue');
  return { useIsMobile: () => ref(false) };
});
vi.mock('./SearchResultsTable.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: { results: { type: Array, required: true }, sort: Object, pluginName: Function },
      emits: ['update:sort'],
      setup(props, { slots, expose }) {
        expose({ resetScroll: () => {} });
        return () =>
          h('div', { 'data-test': 'table' }, [
            ...(props.results as { name: string }[]).map((r) => h('div', { class: 'row' }, r.name)),
            slots.empty?.(),
          ]);
      },
    }),
  };
});

const { default: SearchPane } = await import('./SearchPane.vue');

const plugin = (name: string, over: Partial<SearchPlugin> = {}): SearchPlugin => ({
  name,
  fullName: name.toUpperCase(),
  version: '1',
  url: '',
  isEnabled: true,
  categories: [],
  ...over,
});

const job = (id: number, over: Partial<SearchJob> = {}): SearchJob => ({
  id,
  isRunning: false,
  total: 0,
  pattern: `q${id}`,
  category: 'all',
  plugins: ['enabled'],
  ...over,
});

const result = (index: number, name: string, seeds = 1): SearchResult => ({
  index,
  name,
  url: '',
  size: null,
  seeds,
  leechers: null,
  engine: 'a',
  engineFullName: '',
  siteUrl: '',
  descriptionUrl: '',
  publishedAt: null,
});

let wrapper: VueWrapper | undefined;

async function mountPane() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/search/:tab?', name: 'search', component: { render: () => h('div') } }],
  });
  await router.push('/search');
  wrapper = mount(defineComponent({ components: { SearchPane }, template: '<SearchPane />' }), {
    attachTo: document.body,
    global: {
      plugins: [
        router,
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  });
  await flushPromises();
  return wrapper;
}

const search = (w: VueWrapper) => w.find('button[type="submit"]');
async function typePattern(w: VueWrapper, text: string) {
  await w.find('input[aria-label="Search pattern"]').setValue(text);
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useAppStore().webApiVersion = '2.16.1';
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  qbit.getSearchJobs.mockResolvedValue([]);
  qbit.getSearchPlugins.mockResolvedValue([
    plugin('alpha', { categories: [{ id: 'movies', name: 'Movies' }] }),
    plugin('beta', { categories: [{ id: 'tv', name: 'TV' }] }),
    plugin('off', { isEnabled: false, categories: [{ id: 'books', name: 'Books' }] }),
  ]);
  qbit.getSearchResults.mockResolvedValue({ isRunning: false, total: 0, results: [] });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('SearchPane starting a search', () => {
  it('keeps Search disabled until there is a pattern', async () => {
    const w = await mountPane();
    expect(search(w).attributes('disabled')).toBeDefined();
    await typePattern(w, '   ');
    expect(search(w).attributes('disabled')).toBeDefined();
    await typePattern(w, 'ubuntu');
    expect(search(w).attributes('disabled')).toBeUndefined();
  });

  it('sends the trimmed pattern to the enabled plugins and selects the new job', async () => {
    qbit.startSearch.mockResolvedValue(5);
    qbit.getSearchJobs.mockResolvedValue([]);
    const w = await mountPane();
    qbit.getSearchJobs.mockResolvedValue([job(5, { pattern: 'ubuntu', isRunning: true })]);
    await typePattern(w, '  ubuntu ');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(qbit.startSearch).toHaveBeenCalledWith('ubuntu', 'all', 'enabled');
    expect(w.find('[aria-current="true"]').text()).toContain('ubuntu');
  });

  it('can target a single plugin and a category it offers', async () => {
    const w = await mountPane();
    await w.find('select[aria-label="Plugins"]').setValue('plugin:beta');
    await flushPromises();
    const categories = w.findAll('select[aria-label="Category"] option').map((o) => o.text());
    expect(categories).toEqual(['All categories', 'TV']);
    await w.find('select[aria-label="Category"]').setValue('tv');
    await typePattern(w, 'x');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(qbit.startSearch).toHaveBeenCalledWith('x', 'tv', ['beta']);
  });

  it('offers only categories from enabled plugins by default', async () => {
    const w = await mountPane();
    const ids = w.findAll('select[aria-label="Category"] option').map((o) => o.text());
    expect(ids).toEqual(['All categories', 'Movies', 'TV']);
  });

  it('resets a remembered category that the scope no longer offers', async () => {
    localStorage.setItem(
      'slake:searchOptions',
      JSON.stringify({ scope: 'enabled', category: 'books' }),
    );
    const w = await mountPane();
    expect((w.find('select[aria-label="Category"]').element as HTMLSelectElement).value).toBe(
      'all',
    );
  });

  it('falls back to enabled plugins when the remembered single plugin is gone', async () => {
    localStorage.setItem(
      'slake:searchOptions',
      JSON.stringify({ scope: 'plugin:ghost', category: 'all' }),
    );
    const w = await mountPane();
    expect((w.find('select[aria-label="Plugins"]').element as HTMLSelectElement).value).toBe(
      'enabled',
    );
  });

  it('warns and disables everything when no plugins are installed', async () => {
    qbit.getSearchPlugins.mockResolvedValue([]);
    const w = await mountPane();
    expect(w.text()).toContain('No search plugins are installed');
    await typePattern(w, 'x');
    expect(search(w).attributes('disabled')).toBeDefined();
    expect(w.find('select[aria-label="Plugins"]').attributes('disabled')).toBeDefined();
  });

  it('does not select anything when starting fails', async () => {
    qbit.startSearch.mockRejectedValue(new Error('busy'));
    const w = await mountPane();
    await typePattern(w, 'x');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(w.find('[aria-current="true"]').exists()).toBe(false);
    expect(w.text()).toContain('Results show up here');
  });
});

describe('SearchPane jobs and results', () => {
  beforeEach(() => {
    qbit.getSearchJobs.mockResolvedValue([
      job(1, { pattern: 'old', total: 1 }),
      job(2, { pattern: 'running', isRunning: true, total: 1500, plugins: ['alpha'] }),
    ]);
    qbit.getSearchResults.mockResolvedValue({
      isRunning: false,
      total: 3,
      results: [
        result(0, 'Ubuntu Desktop', 50),
        result(1, 'Ubuntu Server', 2),
        result(2, 'Debian', 9),
      ],
    });
  });

  it('lists jobs newest first with status text and selects the first', async () => {
    const w = await mountPane();
    const items = w.findAll('ul[aria-label="Searches"] li');
    expect(items.map((li) => li.find('span').text())).toEqual(['running', 'old']);
    expect(items[0]!.text()).toContain('Searching… 1,500');
    expect(items[0]!.text()).toContain('ALPHA');
    expect(items[1]!.text()).toContain('1 result');
    expect(items[0]!.find('button').attributes('aria-current')).toBe('true');
  });

  it('shows the selected job results and filters them by words and min seeds', async () => {
    const w = await mountPane();
    expect(w.findAll('.row').map((r) => r.text())).toEqual([
      'Ubuntu Desktop',
      'Debian',
      'Ubuntu Server',
    ]);

    await w.find('input[aria-label="Filter results by name"]').setValue('ubuntu');
    expect(w.findAll('.row')).toHaveLength(2);
    expect(w.text()).toContain('2 of 3');

    await w.find('input[type="number"]').setValue('10');
    expect(w.findAll('.row').map((r) => r.text())).toEqual(['Ubuntu Desktop']);

    await w.find('input[aria-label="Filter results by name"]').setValue('zzz');
    expect(w.text()).toContain('No results match the filter.');
  });

  it('clears the filter when another job is selected', async () => {
    const w = await mountPane();
    await w.find('input[aria-label="Filter results by name"]').setValue('ubuntu');
    await w.findAll('ul[aria-label="Searches"] li button')[1]!.trigger('click');
    await flushPromises();
    const input = w.find('input[aria-label="Filter results by name"]').element as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('stops the selected running job and removes finished ones in bulk', async () => {
    const w = await mountPane();
    const stop = w.findAll('button').find((b) => b.text() === 'Stop')!;
    await stop.trigger('click');
    expect(qbit.stopSearch).toHaveBeenCalledWith(2);

    await w.find('button[aria-label="Remove finished searches"]').trigger('click');
    await flushPromises();
    expect(qbit.deleteSearch).toHaveBeenCalledTimes(1);
    expect(qbit.deleteSearch).toHaveBeenCalledWith(1);
  });

  it('disables bulk removal when every search is still running', async () => {
    qbit.getSearchJobs.mockResolvedValue([job(1, { isRunning: true })]);
    const w = await mountPane();
    expect(
      w.find('button[aria-label="Remove finished searches"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('moves the selection to another job after removing the selected one', async () => {
    const w = await mountPane();
    qbit.getSearchJobs.mockResolvedValue([job(1, { pattern: 'old', total: 1 })]);
    await w
      .findAll('button')
      .find((b) => b.text() === 'Remove')!
      .trigger('click');
    await flushPromises();
    expect(qbit.deleteSearch).toHaveBeenCalledWith(2);
    expect(w.find('[aria-current="true"]').text()).toContain('old');
  });

  it('shows an empty state when there are no searches', async () => {
    qbit.getSearchJobs.mockResolvedValue([]);
    const w = await mountPane();
    expect(w.text()).toContain('No searches yet.');
  });

  it('shows an error when the searches cannot load', async () => {
    qbit.getSearchJobs.mockRejectedValue(new Error('x'));
    const w = await mountPane();
    expect(w.text()).toContain("Couldn't load the searches.");
  });
});
