import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { RawTorrentFile } from '@/types/qbit';
import { useToastsStore } from '@/stores/toasts';

const qbit = vi.hoisted(() => ({ renameFile: vi.fn(), renameFolder: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { default: RenameFilesDialog } = await import('./RenameFilesDialog.vue');
const { QbtHttpError } = await import('@/services/qbit');

const file = (index: number, name: string): RawTorrentFile => ({
  index,
  name,
  size: 1,
  progress: 0,
  priority: 1,
  piece_range: [0, 0],
  availability: 1,
});

const FILES = [file(0, 'dir/a.txt'), file(1, 'dir/b.txt'), file(2, 'dir/c.mkv')];

let wrapper: VueWrapper | null = null;

const button = (label: RegExp) =>
  [...document.querySelectorAll('button')].find((b) => label.test(b.textContent ?? ''))!;
const inputs = () => document.querySelectorAll<HTMLInputElement>('form input:not([type=number])');
async function type(index: number, value: string) {
  const el = inputs()[index]!;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await flushPromises();
}
const previewText = () => document.querySelector('section[aria-label=Preview]')!.textContent!;

function mountDialog(scope = FILES) {
  wrapper = mount(RenameFilesDialog, {
    props: { hash: 'h1', files: FILES, scope, open: true },
    attachTo: document.body,
  });
  return flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  qbit.renameFile.mockResolvedValue(undefined);
  qbit.renameFolder.mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('RenameFilesDialog', () => {
  it('prompts for a search and keeps Rename disabled', async () => {
    await mountDialog();
    expect(previewText()).toContain('Type something to find.');
    expect(button(/^Rename$/).disabled).toBe(true);
  });

  it('previews the matches and counts them on the button', async () => {
    await mountDialog();
    await type(0, '.txt');
    await type(1, '.md');
    expect(previewText()).toContain('2 changes');
    expect(previewText()).toContain('a.md');
    expect(button(/Rename 2/).disabled).toBe(false);
  });

  it('says when nothing matches', async () => {
    await mountDialog();
    await type(0, 'zzz');
    expect(previewText()).toContain('Nothing matches.');
  });

  it('shows a regex error on the Find field', async () => {
    await mountDialog();
    document
      .querySelectorAll<HTMLInputElement>('input[type=checkbox], button[role=checkbox]')[0]!
      .click();
    await type(0, '(');
    expect(document.body.textContent).toContain('Not a valid regular expression.');
  });

  it('blocks applying while any rename is invalid', async () => {
    await mountDialog();
    await type(0, '.txt');
    await type(1, '');
    await type(0, 'a.txt');
    await type(1, 'b.txt');
    expect(previewText()).toContain('Name already taken');
    expect(previewText()).toContain('1 invalid');
    expect(button(/^Rename$/).disabled).toBe(true);
  });

  it('renames each file through the API, then reports changed and closes', async () => {
    await mountDialog();
    await type(0, '.txt');
    await type(1, '.md');
    button(/Rename 2/).click();
    await flushPromises();
    expect(qbit.renameFile).toHaveBeenCalledTimes(2);
    expect(qbit.renameFile).toHaveBeenCalledWith('h1', 'dir/a.txt', 'dir/a.md');
    expect(qbit.renameFile).toHaveBeenCalledWith('h1', 'dir/b.txt', 'dir/b.md');
    expect(wrapper!.emitted('changed')).toHaveLength(1);
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false]);
  });

  it('only renames the files in scope and mentions the scope', async () => {
    await mountDialog([FILES[0]!]);
    expect(document.body.textContent).toContain('Applies to the 1 files matching the filter.');
    await type(0, '.txt');
    await type(1, '.md');
    button(/^Rename$/).click();
    await flushPromises();
    expect(qbit.renameFile).toHaveBeenCalledTimes(1);
    expect(qbit.renameFile).toHaveBeenCalledWith('h1', 'dir/a.txt', 'dir/a.md');
  });

  it('keeps going after a failure, toasts the first one and stays open', async () => {
    qbit.renameFile.mockRejectedValue(new QbtHttpError(409, 'Exists'));
    await mountDialog();
    await type(0, '.txt');
    await type(1, '.md');
    button(/Rename 2/).click();
    await flushPromises();
    expect(qbit.renameFile).toHaveBeenCalledTimes(2);
    expect(useToastsStore().toasts.at(-1)?.message).toBe(
      'Rename failed for a.txt: Exists (and 1 more)',
    );
    expect(wrapper!.emitted('changed')).toHaveLength(1);
    expect(wrapper!.emitted('update:open')).toBeUndefined();
  });

  it('stops at once when signed out (403) without a toast', async () => {
    qbit.renameFile.mockRejectedValue(new QbtHttpError(403, ''));
    await mountDialog();
    await type(0, '.txt');
    await type(1, '.md');
    button(/Rename 2/).click();
    await flushPromises();
    expect(qbit.renameFile).toHaveBeenCalledTimes(1);
    expect(useToastsStore().toasts).toHaveLength(0);
  });
});
