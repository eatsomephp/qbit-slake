import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useTorrentsStore } from '@/stores/torrents';

const qbit = vi.hoisted(() => ({ removeCategories: vi.fn(), deleteTags: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/sync/useMaindata', () => ({ requestSync: vi.fn() }));

const { default: ItemMenu } = await import('./ItemMenu.vue');

let wrapper: VueWrapper | undefined;

async function openMenu(group: 'category' | 'tag', value: string) {
  wrapper = mount(ItemMenu, {
    props: { group, value },
    slots: { default: '<button data-test="trigger">row</button>' },
    attachTo: document.body,
  });
  await wrapper.get('[data-test="trigger"]').trigger('contextmenu');
  await flushPromises();
}

async function choose(label: string) {
  const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((el) =>
    el.textContent?.includes(label),
  );
  expect(item, `menu item "${label}"`).toBeDefined();
  item!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  (item as HTMLElement).click();
  await flushPromises();
}

function seed(useSubcategories: boolean) {
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    server_state: { use_subcategories: useSubcategories },
    torrents: {
      a: { ...DEFAULT_RAW_TORRENT, category: 'tv/anime', tags: 'keep' },
      b: { ...DEFAULT_RAW_TORRENT, category: 'movies', tags: '' },
    },
    categories: {
      tv: { name: 'tv', savePath: '' },
      'tv/anime': { name: 'tv/anime', savePath: '' },
      movies: { name: 'movies', savePath: '' },
      empty: { name: 'empty', savePath: '' },
    },
    tags: ['keep', 'spare'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('ItemMenu', () => {
  it('removes only categories without torrents when subcategories are off', async () => {
    seed(false);
    await openMenu('category', 'movies');
    await choose('Remove unused categories');
    expect(qbit.removeCategories).toHaveBeenCalledWith(['tv', 'empty']);
  });

  it('keeps a parent category whose child has torrents when subcategories are on', async () => {
    seed(true);
    await openMenu('category', 'movies');
    await choose('Remove unused categories');
    expect(qbit.removeCategories).toHaveBeenCalledWith(['empty']);
  });

  it('deletes only tags that no torrent uses', async () => {
    seed(false);
    await openMenu('tag', 'keep');
    await choose('Delete unused tags');
    expect(qbit.deleteTags).toHaveBeenCalledWith(['spare']);
  });
});
