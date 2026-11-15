import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { useSelectionStore } from '@/stores/selection';
import type { RawTorrent } from '@/types/qbit';
import { TorrentState } from '@/constants/qbit';
import TorrentTable from './TorrentTable.vue';

function seed(n: number) {
  const torrents: Record<string, Partial<RawTorrent>> = {};
  for (let i = 0; i < n; i++) {
    torrents[`h${i}`] = {
      ...DEFAULT_RAW_TORRENT,
      name: `torrent ${i}`,
      size: i * 1024,
      progress: 0.5,
    };
  }
  useTorrentsStore().apply({ rid: 1, full_update: true, torrents });
}

function pointer(target: Element, type: string, clientX: number) {
  target.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, cancelable: true }));
}

const rowNames = (w: ReturnType<typeof mount>) =>
  w.findAll('[role=row] [role=cell]:first-child').map((c) => c.text());

// jsdom has no layout; give the scroll container a viewport so the virtualizer renders rows.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(560);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});
afterAll(() => vi.restoreAllMocks());
enableAutoUnmount(afterEach);

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useUiStore().tableView = 'comfortable';
});

describe('TorrentTable', () => {
  it('renders the default visible columns', () => {
    const w = mount(TorrentTable);
    const headers = w.findAll('[role=columnheader]').map((h) => h.text());
    expect(headers).toEqual([
      'Name',
      'Size',
      'Progress',
      'Status',
      'Down',
      'Up',
      'ETA',
      'Ratio',
      'Added',
    ]);
  });

  it('virtualizes: renders only a window of rows out of thousands', async () => {
    seed(5000);
    const w = mount(TorrentTable);
    await flushPromises();
    const rendered = w.findAll('[role=row][aria-rowindex]').length;
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(100);
    expect(w.get('[role=table]').attributes('aria-rowcount')).toBe('5000');
  });

  it('sorts when a header is clicked, toggling direction', async () => {
    seed(5);
    const ui = useUiStore();
    const w = mount(TorrentTable);
    await flushPromises();

    await w.findAll('[role=columnheader]')[1]!.trigger('click'); // Size: desc first
    expect(ui.sorting).toEqual([{ id: 'size', desc: true }]);
    await nextTick();
    expect(rowNames(w)[0]).toBe('torrent 4');

    await w.findAll('[role=columnheader]')[1]!.trigger('click');
    expect(ui.sorting).toEqual([{ id: 'size', desc: false }]);
    await nextTick();
    expect(rowNames(w)[0]).toBe('torrent 0');
  });

  it('re-renders a row when its torrent changes in place', async () => {
    seed(1);
    const w = mount(TorrentTable);
    await flushPromises();
    expect(w.text()).toContain('50.0%');
    useTorrentsStore().apply({ rid: 2, torrents: { h0: { progress: 0.75 } } });
    await nextTick();
    expect(w.text()).toContain('75.0%');
  });

  it('respects persisted column visibility', () => {
    useUiStore().columnVisibility = { ratio: false, tracker: true };
    const w = mount(TorrentTable);
    const headers = w.findAll('[role=columnheader]').map((h) => h.text());
    expect(headers).not.toContain('Ratio');
    expect(headers).toContain('Tracker');
  });

  it('header right-click opens a column picker that toggles visibility and resets', async () => {
    const ui = useUiStore();
    const w = mount(TorrentTable, { attachTo: document.body });
    await w.get('[role=row]').trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();
    const items = [...document.querySelectorAll('[role=menuitemcheckbox]')];
    const labels = items.map((i) => i.textContent?.trim());
    expect(labels).not.toContain('Name'); // never hideable
    expect(labels).toContain('Tracker');
    const ratio = items.find((i) => i.textContent?.trim() === 'Ratio') as HTMLElement;
    expect(ratio.getAttribute('aria-checked')).toBe('true');
    ratio.click();
    await flushPromises();
    expect(ui.columnVisibility.ratio).toBe(false);

    const reset = [...document.querySelectorAll('[role=menuitem]')].find(
      (i) => i.textContent?.trim() === 'Reset columns',
    ) as HTMLElement | undefined;
    expect(reset).toBeDefined(); // the menu stays open after toggling a column
    reset!.click();
    await flushPromises();
    expect(ui.columnVisibility).toEqual({});
  });

  it('shows status with an icon, queue position and colored speed', async () => {
    useTorrentsStore().apply({
      rid: 1,
      full_update: true,
      torrents: {
        q: { ...DEFAULT_RAW_TORRENT, name: 'queued', state: TorrentState.QueuedDL, priority: 3 },
        d: {
          ...DEFAULT_RAW_TORRENT,
          name: 'busy',
          state: TorrentState.Downloading,
          dlspeed: 2048,
        },
      },
    });
    useUiStore().sorting = [{ id: 'name', desc: false }];
    const w = mount(TorrentTable);
    await flushPromises();
    const [busy, queued] = w.findAll('[role=row][aria-rowindex]');
    expect(queued!.text()).toContain('Queued #3');
    expect(busy!.get('span.text-chart-download.truncate').text()).toBe('2.00 KiB/s');
    expect(busy!.find('[role=cell] svg').exists()).toBe(true);
  });

  it('shows tags as chips after the name, two at most plus a count', async () => {
    useTorrentsStore().apply({
      rid: 1,
      full_update: true,
      torrents: { h: { ...DEFAULT_RAW_TORRENT, name: 'x', tags: 'iso, keep, new' } },
    });
    const w = mount(TorrentTable);
    await flushPromises();
    const nameCell = w.get('[role=row][aria-rowindex] [data-col=name]');
    expect(nameCell.findAll('.label-chip').map((c) => c.text())).toEqual(['iso', 'keep']);
    expect(nameCell.text()).toContain('+1');

    expect(w.find('[role=columnheader][data-col=tags]').exists()).toBe(false);
  });

  it('hides the chips beside the name when the Tags column is turned off', async () => {
    useTorrentsStore().apply({
      rid: 1,
      full_update: true,
      torrents: { h: { ...DEFAULT_RAW_TORRENT, name: 'x', tags: 'iso' } },
    });
    useUiStore().columnVisibility = { tags: false };
    const w = mount(TorrentTable);
    await flushPromises();
    expect(w.findAll('.label-chip')).toHaveLength(0);
  });

  it('moves every tag into a Tags column when tags are not shown beside the name', async () => {
    useTorrentsStore().apply({
      rid: 1,
      full_update: true,
      torrents: { h: { ...DEFAULT_RAW_TORRENT, name: 'x', tags: 'iso, keep, new' } },
    });
    const ui = useUiStore();
    ui.tagsInName = false;
    const w = mount(TorrentTable);
    await flushPromises();
    expect(w.get('[data-col=name]').findAll('.label-chip')).toHaveLength(0);
    const tagsCell = w.get('[role=row][aria-rowindex] [data-col=tags]');
    expect(tagsCell.findAll('.label-chip').map((c) => c.text())).toEqual(['iso', 'keep', 'new']);

    ui.columnVisibility = { tags: false };
    await nextTick();
    expect(w.find('[data-col=tags]').exists()).toBe(false);
  });

  it('renders the category column as a colored chip', async () => {
    useTorrentsStore().apply({
      rid: 1,
      full_update: true,
      torrents: { h: { ...DEFAULT_RAW_TORRENT, name: 'x', category: 'linux' } },
    });
    useUiStore().columnVisibility = { category: true };
    const w = mount(TorrentTable);
    await flushPromises();
    expect(w.get('[data-col=category] .label-chip').text()).toBe('linux');
  });

  it('multi-select checkboxes toggle rows without clearing the others, and select all', async () => {
    seed(3);
    const ui = useUiStore();
    const selection = useSelectionStore();
    ui.multiSelect = true;
    ui.sorting = [{ id: 'name', desc: false }];
    const w = mount(TorrentTable);
    await flushPromises();
    const checkbox = (name: string) => w.get(`[role=checkbox][aria-label="Select ${name}"]`);

    await checkbox('torrent 0').trigger('click');
    await checkbox('torrent 2').trigger('click');
    expect([...selection.selected].sort()).toEqual(['h0', 'h2']);
    expect(checkbox('torrent 2').attributes('aria-checked')).toBe('true');

    await w.get('[aria-label="Select all"]').trigger('click');
    expect(selection.size).toBe(3);
    await w.get('[aria-label="Select all"]').trigger('click');
    expect(selection.size).toBe(0);
  });

  it('dragging a resize handle previews live and persists once on release', async () => {
    const ui = useUiStore();
    const w = mount(TorrentTable, { attachTo: document.body });
    const handle = w.get('[aria-label="Resize Size"]');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    pointer(handle.element, 'pointerdown', 100);
    pointer(handle.element, 'pointermove', 150);
    pointer(handle.element, 'pointermove', 160);
    const table = w.get('[role=table]').element as HTMLElement;
    expect(table.style.getPropertyValue('--col-size')).toBe('136px');
    expect(ui.columnSizing.size).toBeUndefined();
    expect(setItem.mock.calls.some(([key]) => key === 'slake:columnSizing')).toBe(false);

    pointer(handle.element, 'pointerup', 160);
    expect(ui.columnSizing.size).toBe(136);
    expect(ui.columnSizing.name).toBeGreaterThan(0);
    setItem.mockRestore();
  });

  it('escape cancels a resize in progress', async () => {
    const ui = useUiStore();
    const w = mount(TorrentTable, { attachTo: document.body });
    const handle = w.get('[aria-label="Resize Size"]');
    pointer(handle.element, 'pointerdown', 100);
    pointer(handle.element, 'pointermove', 200);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    pointer(handle.element, 'pointerup', 200);
    expect(ui.columnSizing).toEqual({});
    const table = w.get('[role=table]').element as HTMLElement;
    expect(table.style.getPropertyValue('--col-size')).toBe('76px');
  });

  it('stacked view drops the column header and renders two-line rows', async () => {
    seed(3);
    const ui = useUiStore();
    ui.tableView = 'stacked';
    const w = mount(TorrentTable);
    await flushPromises();
    expect(w.findAll('[role=columnheader]')).toHaveLength(0);
    expect(w.findAll('[role=row][aria-rowindex]')[0]!.text()).toContain('50.0% of');
  });

  describe('speed limit indicator', () => {
    const limitedRow = () => {
      useTorrentsStore().apply({
        rid: 1,
        full_update: true,
        torrents: {
          lim: { ...DEFAULT_RAW_TORRENT, name: 'limited', dl_limit: 500 * 1024, up_limit: 0 },
          free: { ...DEFAULT_RAW_TORRENT, name: 'free' },
        },
      });
    };

    it('shows a labelled icon only in the limited direction', async () => {
      limitedRow();
      const w = mount(TorrentTable);
      await flushPromises();
      const dlIcon = w.get('[data-hash="lim"] [data-col=dlspeed] [data-speed-limited]');
      expect(dlIcon.attributes('data-tooltip')).toBe('Download limit: 500 KiB/s');
      expect(dlIcon.attributes('aria-label')).toBe('Download limit: 500 KiB/s');
      expect(w.find('[data-hash="lim"] [data-col=upspeed] [data-speed-limited]').exists()).toBe(
        false,
      );
    });

    it('shows no icon for unlimited torrents', async () => {
      limitedRow();
      const w = mount(TorrentTable);
      await flushPromises();
      expect(w.find('[data-hash="free"] [data-speed-limited]').exists()).toBe(false);
    });

    it('labels an upload limit as upload', async () => {
      useTorrentsStore().apply({
        rid: 1,
        full_update: true,
        torrents: { h: { ...DEFAULT_RAW_TORRENT, name: 'x', up_limit: 1024 } },
      });
      const w = mount(TorrentTable);
      await flushPromises();
      expect(w.get('[data-col=upspeed] [data-speed-limited]').attributes('data-tooltip')).toBe(
        'Upload limit: 1.00 KiB/s',
      );
    });

    it('stacked view shows the limit even when that speed is zero', async () => {
      limitedRow();
      useUiStore().tableView = 'stacked';
      const w = mount(TorrentTable);
      await flushPromises();
      const row = w.get('[data-hash="lim"]');
      expect(row.findAll('[data-speed-limited]')).toHaveLength(1);
      expect(row.text()).toContain('↓ 0 B/s');
      expect(w.get('[data-hash="free"]').find('[data-speed-limited]').exists()).toBe(false);
    });
  });

  it('dragging a header onto another reorders the columns', async () => {
    const ui = useUiStore();
    const w = mount(TorrentTable);
    const headerCell = (name: string) =>
      w.findAll('[role=columnheader]').find((h) => h.text() === name)!;
    const ratio = headerCell('Ratio');
    vi.spyOn(ratio.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(500, 0, 100, 28));
    await headerCell('Status').trigger('dragstart');
    await ratio.trigger('dragover', { clientX: 590 });
    await ratio.trigger('drop');
    const order = ui.columnOrder;
    expect(order.indexOf('state')).toBe(order.indexOf('ratio') + 1);
    await nextTick();
    const headers = w.findAll('[role=columnheader]').map((h) => h.text());
    expect(headers.indexOf('Status')).toBe(headers.indexOf('Ratio') + 1);
  });

  it('keeps the view menu out of the Name header so it cannot travel with the column', () => {
    const w = mount(TorrentTable);
    const nameHeader = w.get('[role=columnheader][data-col=name]');
    expect(nameHeader.find('button').exists()).toBe(false);
    expect(w.find('[aria-label="View options"]').exists()).toBe(false);
  });

  describe('multi-select mode', () => {
    async function mountMultiSelect() {
      seed(4);
      const ui = useUiStore();
      const selection = useSelectionStore();
      ui.multiSelect = true;
      ui.sorting = [{ id: 'name', desc: false }];
      const w = mount(TorrentTable);
      await flushPromises();
      const nameCell = (i: number) => w.get(`[data-hash="h${i}"] [data-col=name]`);
      return { ui, selection, nameCell };
    }

    it('plain clicks add rows to the selection and click again to remove', async () => {
      const { selection, nameCell } = await mountMultiSelect();
      await nameCell(0).trigger('click');
      await nameCell(2).trigger('click');
      expect([...selection.selected].sort()).toEqual(['h0', 'h2']);
      await nameCell(0).trigger('click');
      expect([...selection.selected]).toEqual(['h2']);
    });

    it('shift-click extends the selection without dropping earlier picks', async () => {
      const { selection, nameCell } = await mountMultiSelect();
      await nameCell(3).trigger('click');
      await nameCell(0).trigger('click');
      await nameCell(1).trigger('click', { shiftKey: true });
      expect([...selection.selected].sort()).toEqual(['h0', 'h1', 'h3']);
    });

    it('double-click and right-click keep the rest of the selection', async () => {
      const { ui, selection, nameCell } = await mountMultiSelect();
      await nameCell(0).trigger('click');
      await nameCell(1).trigger('click');
      await nameCell(1).trigger('click');
      await nameCell(1).trigger('dblclick');
      expect([...selection.selected].sort()).toEqual(['h0', 'h1']);
      expect(ui.detailsOpen).toBe(true);
      await nameCell(2).trigger('contextmenu');
      expect([...selection.selected].sort()).toEqual(['h0', 'h1', 'h2']);
    });

    it('is off by default: a plain click replaces the selection', async () => {
      seed(2);
      const selection = useSelectionStore();
      const w = mount(TorrentTable);
      await flushPromises();
      await w.get('[data-hash="h0"] [data-col=name]').trigger('click');
      await w.get('[data-hash="h1"] [data-col=name]').trigger('click');
      expect([...selection.selected]).toEqual(['h1']);
    });
  });
});
