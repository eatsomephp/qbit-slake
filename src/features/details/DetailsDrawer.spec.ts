import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import type { RawTorrentFile } from '@/types/qbit';

const qbit = vi.hoisted(() => ({
  getProperties: vi.fn(),
  getTrackers: vi.fn(),
  getFiles: vi.fn(),
  getPeers: vi.fn(),
  getPieceStates: vi.fn(),
  setFilePriority: vi.fn(),
  renameFile: vi.fn(),
  renameFolder: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { default: DetailsDrawer } = await import('./DetailsDrawer.vue');

const file = (index: number, name: string): RawTorrentFile => ({
  index,
  name,
  size: 1024,
  progress: 0.5,
  priority: 1,
  piece_range: [0, 0],
  availability: 1,
});

let wrapper: ReturnType<typeof mount> | null = null;
function mountDrawer() {
  const client = new QueryClient();
  wrapper = mount(DetailsDrawer, {
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  });
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    torrents: { h1: { ...DEFAULT_RAW_TORRENT, name: 'Debian ISO', size: 2048, total_size: 2048 } },
  });
  qbit.getProperties.mockResolvedValue({
    pieces_num: 10,
    piece_size: 4096,
    pieces_have: 5,
    time_elapsed: 90,
    nb_connections: 3,
    nb_connections_limit: 100,
  });
  qbit.getTrackers.mockResolvedValue([
    {
      url: 'https://t.example/announce',
      status: 4,
      tier: 0,
      num_peers: 1,
      num_seeds: 2,
      num_leeches: 3,
      num_downloaded: 4,
      msg: 'timed out',
    },
  ]);
  qbit.getFiles.mockResolvedValue([file(0, 'dir/a.iso'), file(1, 'dir/b.txt')]);
  qbit.getPeers.mockResolvedValue({ rid: 1, full_update: true, peers: {} });
  qbit.getPieceStates.mockResolvedValue([2, 2, 2, 1, 0, 0, 0, 0, 0, 0]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('DetailsDrawer', () => {
  it('asks for a selection when nothing is focused', () => {
    const w = mountDrawer();
    expect(w.text()).toContain('Select a torrent');
    expect(qbit.getProperties).not.toHaveBeenCalled();
  });

  it('follows the focused torrent and only fetches the open tab', async () => {
    useSelectionStore().selectOnly('h1');
    const w = mountDrawer();
    await flushPromises();
    expect(w.text()).toContain('Debian ISO');
    expect(w.text()).toContain('3 / 10 pieces × 4.00 KiB');
    expect(qbit.getPieceStates).toHaveBeenCalledWith('h1', expect.any(AbortSignal));
    expect(qbit.getProperties).toHaveBeenCalledWith('h1', expect.any(AbortSignal));
    expect(qbit.getTrackers).not.toHaveBeenCalled();

    await w.findAll('[role=tab]')[1]!.trigger('click');
    await flushPromises();
    expect(useUiStore().detailsTab).toBe('trackers');
    expect(w.text()).toContain('Not working');
    expect(w.text()).toContain('timed out');
  });

  it('hides the drawer from its hide button', async () => {
    useSelectionStore().selectOnly('h1');
    const w = mountDrawer();
    await w.get('[aria-label="Hide details"]').trigger('click');
    expect(useUiStore().detailsOpen).toBe(false);
  });

  it('keeps the panel open when the active tab is clicked again', async () => {
    useSelectionStore().selectOnly('h1');
    const w = mountDrawer();
    await w.findAll('[role=tab]')[0]!.trigger('click');
    expect(w.find('[role=tabpanel]').exists()).toBe(true);
    expect(useUiStore().detailsOpen).toBe(true);
  });

  it('files tab: shows the tree and unchecking a folder skips all its files', async () => {
    useSelectionStore().selectOnly('h1');
    useUiStore().detailsTab = 'files';
    const w = mountDrawer();
    await flushPromises();
    const names = w.findAll('[role=row] span[data-tooltip]').map((s) => s.text());
    expect(names).toEqual(['dir', 'a.iso', 'b.txt']);

    await w.get('[aria-label="Download dir"]').trigger('click');
    await flushPromises();
    expect(qbit.setFilePriority).toHaveBeenCalledWith('h1', [0, 1], 0);
    expect(qbit.getFiles).toHaveBeenCalledTimes(2);
  });

  it('files tab: checking a partly skipped folder only re-enables the skipped files', async () => {
    qbit.getFiles.mockResolvedValue([
      { ...file(0, 'dir/a.iso'), priority: 6 },
      { ...file(1, 'dir/b.txt'), priority: 0 },
    ]);
    useSelectionStore().selectOnly('h1');
    useUiStore().detailsTab = 'files';
    const w = mountDrawer();
    await flushPromises();
    expect(w.get('[aria-label="Download dir"]').attributes('data-state')).toBe('indeterminate');

    await w.get('[aria-label="Download dir"]').trigger('click');
    await flushPromises();
    expect(qbit.setFilePriority).toHaveBeenCalledWith('h1', [1], 1);
  });

  it('files tab: filtering narrows the tree to matching paths', async () => {
    useSelectionStore().selectOnly('h1');
    useUiStore().detailsTab = 'files';
    const w = mountDrawer();
    await flushPromises();
    await w.get('input[aria-label="Filter files"]').setValue('.txt');
    const names = w.findAll('[role=row] span[data-tooltip]').map((s) => s.text());
    expect(names).toEqual(['dir', 'b.txt']);
    expect(w.text()).toContain('2 of 2 files');
  });

  it('files tab: renames a file inline', async () => {
    useSelectionStore().selectOnly('h1');
    useUiStore().detailsTab = 'files';
    const w = mountDrawer();
    await flushPromises();
    const row = w
      .findAll('[role=row]')
      .find((r) => r.find('[aria-label="Download b.txt"]').exists())!;
    await row.trigger('contextmenu');
    await flushPromises();
    const renameItem = [...document.body.querySelectorAll<HTMLElement>('[role=menuitem]')].find(
      (item) => item.textContent?.includes('Rename'),
    )!;
    renameItem.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    renameItem.click();
    await flushPromises();
    const input = w.get('input[aria-label="New name"]');
    await input.setValue('c.txt');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(qbit.renameFile).toHaveBeenCalledWith('h1', 'dir/b.txt', 'dir/c.txt');
  });

  it('peers tab polls torrentPeers from rid 0', async () => {
    useSelectionStore().selectOnly('h1');
    useUiStore().detailsTab = 'peers';
    mountDrawer();
    // The first poll is scheduled with setTimeout(0), so wait rather than flush.
    await vi.waitFor(() =>
      expect(qbit.getPeers).toHaveBeenCalledWith('h1', 0, expect.any(AbortSignal)),
    );
  });
});
