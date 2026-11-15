import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';

const qbit = vi.hoisted(() => ({
  createCategory: vi.fn(),
  editCategory: vi.fn(),
  removeCategories: vi.fn(),
  setCategory: vi.fn(),
  createTags: vi.fn(),
  addTags: vi.fn(),
  deleteTags: vi.fn(),
  setLocation: vi.fn(),
  getDirectoryContent: vi.fn(),
  getFreeSpaceAtPath: vi.fn(),
  renameTorrent: vi.fn(),
  setDownloadLimit: vi.fn(),
  setUploadLimit: vi.fn(),
  setShareLimits: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/sync/useMaindata', () => ({ requestSync: vi.fn() }));

HTMLElement.prototype.scrollTo = vi.fn();

const { default: ManageDialogs } = await import('./ManageDialogs.vue');
const { openManage, manage } = await import('./manageState');

let wrapper: ReturnType<typeof mount> | null = null;
const $ = <T extends Element = HTMLInputElement>(sel: string) => document.querySelector<T>(sel)!;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
async function type(sel: string, value: string) {
  const el = $(sel);
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await flushPromises();
}
async function choose(sel: string, value: string) {
  const el = $<HTMLSelectElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event('change'));
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    torrents: {
      a: { ...DEFAULT_RAW_TORRENT, name: 'Alpha', save_path: '/dl', dl_limit: 2048, up_limit: 0 },
      b: { ...DEFAULT_RAW_TORRENT, name: 'Beta', save_path: '/dl', dl_limit: 2048, up_limit: 0 },
    },
    categories: { tv: { name: 'tv', savePath: '/dl/tv' } },
  });
  useAppStore().webApiVersion = '2.16.0';
  qbit.getDirectoryContent.mockResolvedValue([]);
  qbit.getFreeSpaceAtPath.mockResolvedValue(1024 ** 3);
  wrapper = mount(ManageDialogs, {
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
});
afterEach(() => {
  wrapper?.unmount();
  manage.value = null;
});

describe('ManageDialogs', () => {
  it('creates a category and moves the selection into it', async () => {
    openManage({ kind: 'category', applyTo: ['a', 'b'] });
    await flushPromises();
    await type('[role=dialog] input', 'movies');
    button('Create').click();
    await flushPromises();
    expect(qbit.createCategory).toHaveBeenCalledWith(
      'movies',
      expect.objectContaining({ savePath: '' }),
    );
    expect(qbit.setCategory).toHaveBeenCalledWith(['a', 'b'], 'movies');
    expect(manage.value).toBeNull();
  });

  it('refuses a duplicate category name', async () => {
    openManage({ kind: 'category' });
    await flushPromises();
    await type('[role=dialog] input', 'tv');
    expect(document.body.textContent).toContain('already exists');
    expect(button('Create').disabled).toBe(true);
  });

  it('edits a category save path', async () => {
    openManage({ kind: 'category', edit: 'tv' });
    await flushPromises();
    expect($('[role=dialog] input').value).toBe('/dl/tv');
    await type('[role=dialog] input', '/media/tv');
    button('Save').click();
    await flushPromises();
    expect(qbit.editCategory).toHaveBeenCalledWith(
      'tv',
      expect.objectContaining({ savePath: '/media/tv' }),
    );
  });

  it('adds new tags to the selection, or just creates them', async () => {
    openManage({ kind: 'tags', applyTo: ['a'] });
    await flushPromises();
    await type('#new-tags', 'x, y, x');
    button('Add 2 tags').click();
    await flushPromises();
    expect(qbit.addTags).toHaveBeenCalledWith(['a'], ['x', 'y']);

    openManage({ kind: 'tags' });
    await flushPromises();
    await type('#new-tags', 'z');
    button('Add tag').click();
    await flushPromises();
    expect(qbit.createTags).toHaveBeenCalledWith(['z']);
  });

  it('prefills a shared save path and moves torrents', async () => {
    openManage({ kind: 'location', hashes: ['a', 'b'] });
    await flushPromises();
    expect($('#location-path').value).toBe('/dl');
    await type('#location-path', '/archive');
    button('Move').click();
    await flushPromises();
    expect(qbit.setLocation).toHaveBeenCalledWith(['a', 'b'], '/archive');
  });

  it('fills the save path from the folder picker and moves torrents there', async () => {
    qbit.getDirectoryContent.mockResolvedValue(['/dl/archive', '/dl/misc']);
    openManage({ kind: 'location', hashes: ['a', 'b'] });
    await flushPromises();
    $<HTMLButtonElement>('button[aria-label="Browse for new save path"]').click();
    await flushPromises();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/dl');
    [...document.querySelectorAll<HTMLButtonElement>('[role=listitem] button')]
      .find((b) => b.textContent?.trim() === 'archive')!
      .click();
    await flushPromises();
    button('Use this folder').click();
    await flushPromises();
    expect($('#location-path').value).toBe('/dl/archive');
    expect(qbit.setLocation).not.toHaveBeenCalled();
    button('Move').click();
    await flushPromises();
    expect(qbit.setLocation).toHaveBeenCalledWith(['a', 'b'], '/dl/archive');
  });

  it('focuses the primary field when Set location and Rename open', async () => {
    openManage({ kind: 'location', hashes: ['a'] });
    await flushPromises();
    expect(document.activeElement).toBe($('#location-path'));
    manage.value = null;
    await flushPromises();
    openManage({ kind: 'rename', hash: 'a' });
    await flushPromises();
    expect(document.activeElement).toBe($('#rename-name'));
  });

  it('renames a torrent', async () => {
    openManage({ kind: 'rename', hash: 'a' });
    await flushPromises();
    expect(button('Rename').disabled).toBe(true); // unchanged
    await type('#rename-name', 'Alpha 2');
    button('Rename').click();
    await flushPromises();
    expect(qbit.renameTorrent).toHaveBeenCalledWith('a', 'Alpha 2');
  });

  it('speed limits: prefills the shared value in KiB/s and sends bytes/s, 0 for unlimited', async () => {
    openManage({ kind: 'speedLimits', hashes: ['a', 'b'] });
    await flushPromises();
    expect($('#speed-limit-download').value).toBe('2');
    expect($('#speed-limit-upload').value).toBe('');
    await type('#speed-limit-upload', '512');
    await type('#speed-limit-download', '');
    button('Apply').click();
    await flushPromises();
    expect(qbit.setDownloadLimit).toHaveBeenCalledWith(['a', 'b'], 0);
    expect(qbit.setUploadLimit).toHaveBeenCalledWith(['a', 'b'], 512 * 1024);
  });

  it('share limits: custom ratio, and action/mode only when the API supports them', async () => {
    useAppStore().webApiVersion = '2.11.4';
    openManage({ kind: 'shareLimits', hashes: ['a'] });
    await flushPromises();
    expect(document.querySelector('select[name="shareLimitAction"]')).toBeNull();
    expect(document.body.textContent).toContain('applies the global action');
    await choose('select[aria-label="Ratio mode"]', 'custom');
    await type('input[aria-label=Ratio]', '1.5');
    await choose('select[aria-label="Seeding time mode"]', 'none');
    button('Apply').click();
    await flushPromises();
    expect(qbit.setShareLimits).toHaveBeenCalledWith(['a'], {
      ratioLimit: 1.5,
      seedingTimeLimit: -1,
      inactiveSeedingTimeLimit: -2,
      action: 'Default',
      mode: 'Default',
    });
  });

  it('share limits: newer API shows action and mode', async () => {
    useAppStore().webApiVersion = '2.15.3';
    openManage({ kind: 'shareLimits', hashes: ['a', 'b'] });
    await flushPromises();
    await choose('select[name="shareLimitAction"]', 'Stop');
    await choose('select[name="shareLimitsMode"]', 'MatchAny');
    button('Apply').click();
    await flushPromises();
    expect(qbit.setShareLimits).toHaveBeenCalledWith(
      ['a', 'b'],
      expect.objectContaining({ action: 'Stop', mode: 'MatchAny' }),
    );
  });

  it('confirms before removing a category or deleting a tag', async () => {
    openManage({ kind: 'removeCategory', name: 'tv' });
    await flushPromises();
    expect(qbit.removeCategories).not.toHaveBeenCalled();
    button('Remove category').click();
    await flushPromises();
    expect(qbit.removeCategories).toHaveBeenCalledWith(['tv']);

    openManage({ kind: 'deleteTag', name: 'x' });
    await flushPromises();
    button('Delete tag').click();
    await flushPromises();
    expect(qbit.deleteTags).toHaveBeenCalledWith(['x']);
  });
});
