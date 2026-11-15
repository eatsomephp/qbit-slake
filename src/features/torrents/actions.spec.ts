import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';
import { QbtHttpError } from '@/services/qbit/http';

const qbit = vi.hoisted(() => ({
  startTorrents: vi.fn(),
  stopTorrents: vi.fn(),
  deleteTorrents: vi.fn(),
  recheckTorrents: vi.fn(),
  reannounceTorrents: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
const requestSync = vi.hoisted(() => vi.fn());
vi.mock('@/sync/useMaindata', () => ({ requestSync }));

const { default: TorrentTable } = await import('./TorrentTable.vue');
const { default: DeleteDialog } = await import('./DeleteDialog.vue');
const { useTorrentActions, deleteRequest } = await import('./useTorrentActions');

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(560);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});
afterAll(() => vi.restoreAllMocks());

function seed(n: number) {
  const torrents: Record<string, object> = {};
  for (let i = 0; i < n; i++) {
    torrents[`h${i}`] = {
      ...DEFAULT_RAW_TORRENT,
      name: `t${i}`,
      size: 1024 * (i + 1),
      added_on: n - i,
    };
  }
  useTorrentsStore().apply({ rid: 1, full_update: true, torrents });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  deleteRequest.open = false;
  deleteRequest.hashes = [];
});

describe('useTorrentActions', () => {
  it('calls the provider and requests an immediate sync', async () => {
    const actions = useTorrentActions();
    await actions.start(['a', 'b']);
    expect(qbit.startTorrents).toHaveBeenCalledWith(['a', 'b']);
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty selection', async () => {
    await useTorrentActions().stop([]);
    expect(qbit.stopTorrents).not.toHaveBeenCalled();
  });

  it('shows an error toast on failure and does not sync', async () => {
    qbit.recheckTorrents.mockRejectedValueOnce(new QbtHttpError(500, 'boom'));
    await useTorrentActions().recheck(['a']);
    expect(useToastsStore().toasts[0]).toMatchObject({ kind: 'error' });
    expect(useToastsStore().toasts[0]!.message).toBe('Recheck failed: boom');
    expect(requestSync).not.toHaveBeenCalled();
  });

  it('falls back to the status code when the body is not a short message', async () => {
    qbit.stopTorrents.mockRejectedValueOnce(new QbtHttpError(500, { detail: 'x' }));
    await useTorrentActions().stop(['a']);
    expect(useToastsStore().toasts[0]!.message).toBe('Stop failed: qBittorrent responded with 500');
  });

  it('stays quiet on 403 (handled globally)', async () => {
    qbit.stopTorrents.mockRejectedValueOnce(new QbtHttpError(403, ''));
    await useTorrentActions().stop(['a']);
    expect(useToastsStore().toasts).toEqual([]);
  });

  it('confirmDelete only opens the dialog', () => {
    useTorrentActions().confirmDelete(['a']);
    expect(deleteRequest).toEqual({ open: true, hashes: ['a'] });
    expect(qbit.deleteTorrents).not.toHaveBeenCalled();
  });
});

describe('table selection', () => {
  const row = (w: ReturnType<typeof mount>, hash: string) =>
    w.get(`[data-hash="${hash}"] [role=cell]`);
  const selected = () => [...useSelectionStore().selected].sort();

  it('click, ctrl-click and shift-click', async () => {
    seed(6); // default sort: addedOn desc → h0..h5
    const w = mount(TorrentTable);
    await flushPromises();

    await row(w, 'h1').trigger('click');
    expect(selected()).toEqual(['h1']);
    await row(w, 'h3').trigger('click', { metaKey: true });
    expect(selected()).toEqual(['h1', 'h3']);
    await row(w, 'h4').trigger('click', { shiftKey: true });
    expect(selected()).toEqual(['h3', 'h4']);
  });

  it('marks selected rows and right-click selects an unselected row', async () => {
    seed(3);
    const w = mount(TorrentTable);
    await flushPromises();
    await row(w, 'h0').trigger('click');
    await row(w, 'h2').trigger('contextmenu');
    await nextTick();
    expect(selected()).toEqual(['h2']);
    expect(w.get('[data-hash="h2"]').attributes('aria-selected')).toBe('true');
    expect(w.get('[data-hash="h0"]').attributes('aria-selected')).toBe('false');

    useSelectionStore().toggle('h0');
    await row(w, 'h2').trigger('contextmenu'); // already selected: keep the multi-selection
    expect(selected()).toEqual(['h0', 'h2']);
  });
});

describe('DeleteDialog', () => {
  it('shows count and size, defaults to keeping files, and deletes on confirm', async () => {
    seed(3);
    const w = mount(DeleteDialog, { attachTo: document.body });
    useTorrentActions().confirmDelete(['h0', 'h1']);
    await flushPromises();

    expect(document.body.textContent).toContain('Delete 2 torrents?');
    expect(document.body.textContent).toContain('3.00 KiB in total');
    const confirm = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Delete torrents'),
    )!;
    confirm.click();
    await flushPromises();
    expect(qbit.deleteTorrents).toHaveBeenCalledWith(['h0', 'h1'], false);
    expect(deleteRequest.open).toBe(false);
    w.unmount();
  });

  it('passes deleteFiles when the box is checked, and resets it next time', async () => {
    seed(1);
    const w = mount(DeleteDialog, { attachTo: document.body });
    useTorrentActions().confirmDelete(['h0']);
    await flushPromises();
    (document.querySelector('[role=checkbox]') as HTMLElement).click();
    await flushPromises();
    const confirm = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Delete torrents and files'),
    )!;
    confirm.click();
    await flushPromises();
    expect(qbit.deleteTorrents).toHaveBeenCalledWith(['h0'], true);

    useTorrentActions().confirmDelete(['h0']);
    await flushPromises();
    expect(document.querySelector('[role=checkbox]')!.getAttribute('aria-checked')).toBe('false');
    w.unmount();
  });
});
