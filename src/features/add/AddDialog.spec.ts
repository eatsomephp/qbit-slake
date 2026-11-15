import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';

const qbit = vi.hoisted(() => ({
  addTorrents: vi.fn(),
  getDirectoryContent: vi.fn(),
  getFreeSpaceAtPath: vi.fn(),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
const requestSync = vi.hoisted(() => vi.fn());
vi.mock('@/sync/useMaindata', () => ({ requestSync }));

const { default: AddDialog } = await import('./AddDialog.vue');
const { addRequest, openAdd, resetAdd } = await import('./addState');
const { useWindowDrop } = await import('./useWindowDrop');

HTMLElement.prototype.scrollTo = vi.fn();

const HASH = 'c'.repeat(40);

function mountDialog() {
  mounted = mount(AddDialog, { attachTo: document.body, global: { plugins: [VueQueryPlugin] } });
  return mounted;
}
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label))!;

let mounted: ReturnType<typeof mount> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  resetAdd();
  qbit.getDirectoryContent.mockResolvedValue([]);
  qbit.getFreeSpaceAtPath.mockResolvedValue(1024 ** 3);
  addRequest.open = false;
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    categories: { linux: { name: 'linux', savePath: '/dl/linux' } },
    tags: ['keep'],
  });
});

describe('openAdd', () => {
  it('appends text and de-duplicates files', () => {
    const f = new File(['x'], 'a.torrent');
    openAdd({ text: 'magnet:?a', files: [f] });
    openAdd({ text: 'magnet:?b', files: [new File(['x'], 'a.torrent')] });
    expect(addRequest.text).toBe('magnet:?a\nmagnet:?b');
    expect(addRequest.files).toHaveLength(1);
    expect(addRequest.open).toBe(true);
  });
});

describe('AddDialog', () => {
  it('submits links with remembered options, then resets and syncs', async () => {
    qbit.addTorrents.mockResolvedValue({ ok: true, failed: 0 });
    mountDialog();
    openAdd({ text: `${HASH}\nnot a link` });
    await flushPromises();

    expect(document.body.textContent).toContain('1 line not recognized');
    expect($<HTMLInputElement>('input[placeholder]').placeholder).toBe('/downloads');

    const select = $<HTMLSelectElement>('select');
    select.value = 'linux';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    expect($<HTMLInputElement>('input[placeholder]').placeholder).toBe('/dl/linux');

    button('keep').click();
    const newTags = $<HTMLInputElement>('input[aria-label="New tags"]');
    newTags.value = 'fresh, , x';
    newTags.dispatchEvent(new Event('input'));
    await flushPromises(); // Input emits update:modelValue from a watcher
    button('Add torrent').click();
    await flushPromises();

    expect(qbit.addTorrents).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: [`magnet:?xt=urn:btih:${HASH}`],
        files: [],
        category: 'linux',
        tags: ['keep', 'fresh', 'x'],
        stopped: false,
      }),
    );
    expect(requestSync).toHaveBeenCalled();
    expect(addRequest.open).toBe(false);
    expect(addRequest.text).toBe('');
    expect(JSON.parse(localStorage.getItem('slake:addOptions')!)).toMatchObject({
      category: 'linux',
      tags: ['keep'],
    });
  });

  it('opens the folder picker at the default save path when no category is chosen', async () => {
    mountDialog();
    openAdd({ text: HASH });
    await flushPromises();
    $<HTMLButtonElement>('button[aria-label^="Browse for"]').click();
    await flushPromises();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/downloads');
  });

  it('opens the picker at the category path and sends the picked folder as save path', async () => {
    qbit.addTorrents.mockResolvedValue({ ok: true, failed: 0 });
    qbit.getDirectoryContent.mockResolvedValue(['/dl/linux/iso']);
    mountDialog();
    openAdd({ text: HASH });
    await flushPromises();
    const select = $<HTMLSelectElement>('select');
    select.value = 'linux';
    select.dispatchEvent(new Event('change'));
    await flushPromises();

    $<HTMLButtonElement>('button[aria-label^="Browse for"]').click();
    await flushPromises();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/dl/linux');
    [...document.querySelectorAll<HTMLButtonElement>('[role=listitem] button')]
      .find((b) => b.textContent?.trim() === 'iso')!
      .click();
    await flushPromises();
    button('Use this folder').click();
    await flushPromises();
    expect($<HTMLInputElement>('#add-save-path').value).toBe('/dl/linux/iso');
    expect(qbit.addTorrents).not.toHaveBeenCalled();

    button('Add torrent').click();
    await flushPromises();
    expect(qbit.addTorrents).toHaveBeenCalledWith(
      expect.objectContaining({ savePath: '/dl/linux/iso' }),
    );
  });

  it('keeps input and shows an error when qBittorrent rejects it', async () => {
    qbit.addTorrents.mockResolvedValue({ ok: false, failed: 0 });
    mountDialog();
    openAdd({ text: 'magnet:?xt=urn:btih:x' });
    await flushPromises();
    button('Add torrent').click();
    await flushPromises();
    expect(addRequest.open).toBe(true);
    expect(addRequest.text).toBe('magnet:?xt=urn:btih:x');
    expect(useToastsStore().toasts[0]?.kind).toBe('error');
  });

  it('reports partial failures', async () => {
    qbit.addTorrents.mockResolvedValue({ ok: true, failed: 1 });
    mountDialog();
    openAdd({ text: 'magnet:?xt=urn:btih:x\nmagnet:?xt=urn:btih:y' });
    await flushPromises();
    button('Add 2 torrents').click();
    await flushPromises();
    expect(useToastsStore().toasts[0]).toMatchObject({
      kind: 'error',
      message: "1 of 2 torrents couldn't be added.",
    });
    expect(addRequest.open).toBe(false);
  });

  it('disables submit with nothing to add', async () => {
    mountDialog();
    openAdd();
    await flushPromises();
    expect(button('Add torrent').disabled).toBe(true);
  });
});

describe('useWindowDrop', () => {
  function dropEvent(data: { files?: File[]; text?: string }) {
    const types = [...(data.files?.length ? ['Files'] : []), ...(data.text ? ['text/plain'] : [])];
    const e = new Event('drop', { cancelable: true }) as DragEvent;
    Object.defineProperty(e, 'dataTransfer', {
      value: { types, files: data.files ?? [], getData: () => data.text ?? '' },
    });
    return e;
  }

  it('opens the dialog with dropped .torrent files, ignoring other files', () => {
    const { onDrop } = useWindowDrop();
    const e = dropEvent({ files: [new File(['x'], 'a.torrent'), new File(['x'], 'b.txt')] });
    onDrop(e);
    expect(e.defaultPrevented).toBe(true);
    expect(addRequest.files.map((f) => f.name)).toEqual(['a.torrent']);
    expect(addRequest.open).toBe(true);
  });

  it('opens the dialog with dropped magnet text', () => {
    const { onDrop } = useWindowDrop();
    onDrop(dropEvent({ text: 'magnet:?xt=urn:btih:abc' }));
    expect(addRequest.text).toBe('magnet:?xt=urn:btih:abc');
  });
});
