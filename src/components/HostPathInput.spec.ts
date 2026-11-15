import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { useAppStore } from '@/stores/app';
import { QbtHttpError } from '@/services/qbit/http';

const qbit = vi.hoisted(() => ({
  getDirectoryContent: vi.fn(),
  getFreeSpaceAtPath: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { default: HostPathInput } = await import('./HostPathInput.vue');

HTMLElement.prototype.scrollTo = vi.fn();

const TREE: Record<string, string[]> = {
  '/': ['/downloads', '/media'],
  '/downloads': ['/downloads/tv', '/downloads/movies'],
  '/downloads/tv': [],
  '/downloads/movies': ['/downloads/movies/2024'],
  '/downloads/movies/2024': [],
  '/media': [],
};

let wrapper: VueWrapper | undefined;

function mountField(
  props: {
    modelValue?: string;
    placeholder?: string;
    showFreeSpace?: boolean;
    disabled?: boolean;
  } = {},
) {
  wrapper = mount(HostPathInput, {
    props: {
      id: 'path',
      label: 'Default save path',
      modelValue: '',
      ...props,
      'onUpdate:modelValue': (value: string) => wrapper!.setProps({ modelValue: value }),
    },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  return wrapper;
}

const input = () => document.querySelector<HTMLInputElement>('#path')!;
const browseButton = () =>
  document.querySelector<HTMLButtonElement>('button[aria-label="Browse for Default save path"]')!;
const buttonNamed = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined;
const folderNames = () =>
  [...document.body.querySelectorAll('[role="listitem"]')].map((e) => e.textContent?.trim());
const alertText = () => document.body.querySelector('[role="alert"]')?.textContent?.trim();
const pickerOpen = () => buttonNamed('Use this folder') !== undefined;
const click = async (button: HTMLElement | undefined) => {
  button!.click();
  await flushPromises();
};
const openPicker = async () => click(browseButton());
const openFolder = async (name: string) =>
  click(
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="listitem"] button')].find(
      (b) => b.textContent?.trim() === name,
    ),
  );

function notFound() {
  return new QbtHttpError(404, 'Not found');
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  useAppStore().webApiVersion = '2.16.0';
  qbit.getDirectoryContent.mockImplementation(async (path: string) => {
    const entries = TREE[path.length > 1 ? path.replace(/\/+$/, '') : path];
    if (!entries) throw notFound();
    return entries;
  });
  qbit.getFreeSpaceAtPath.mockResolvedValue(1024 ** 3);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('HostPathInput input', () => {
  it('edits the model through the text input', async () => {
    const w = mountField({ modelValue: '/downloads' });
    expect(input().value).toBe('/downloads');
    await w.get('#path').setValue('/media');
    expect(w.emitted('update:modelValue')).toEqual([['/media']]);
  });

  it('disables the input and the browse button', () => {
    mountField({ disabled: true });
    expect(input().disabled).toBe(true);
    expect(browseButton().disabled).toBe(true);
  });
});

describe('HostPathInput folder picker', () => {
  it('opens at the typed absolute path', async () => {
    mountField({ modelValue: '/downloads' });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/downloads');
    expect(folderNames()).toEqual(['movies', 'tv']);
  });

  it.each(['', 'relative/dir'])('opens at the root for %j', async (typed) => {
    mountField({ modelValue: typed });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledTimes(1);
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/');
    expect(folderNames()).toEqual(['downloads', 'media']);
  });

  it('walks up to the nearest existing parent of a missing path', async () => {
    mountField({ modelValue: '/downloads/movies/gone/deeper' });
    await openPicker();
    expect(qbit.getDirectoryContent.mock.calls.map(([p]) => p)).toEqual([
      '/downloads/movies/gone/deeper',
      '/downloads/movies/gone',
      '/downloads/movies',
    ]);
    expect(folderNames()).toEqual(['2024']);
    expect(alertText()).toBeUndefined();
  });

  it('shows the error instead of walking up when the failure is not a 404', async () => {
    qbit.getDirectoryContent.mockRejectedValue(new QbtHttpError(400, 'Invalid directory path'));
    mountField({ modelValue: '/downloads' });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledTimes(1);
    expect(alertText()).toBe('Invalid directory path');
  });

  it('sorts subfolders by name with numeric collation', async () => {
    qbit.getDirectoryContent.mockResolvedValue([
      '/data/season 10',
      '/data/season 2',
      '/data/Alpha',
      '/data/season 1',
    ]);
    mountField({ modelValue: '/data' });
    await openPicker();
    expect(folderNames()).toEqual(['Alpha', 'season 1', 'season 2', 'season 10']);
  });

  it('says so when a folder has no subfolders', async () => {
    mountField({ modelValue: '/downloads/tv' });
    await openPicker();
    expect(folderNames()).toEqual([]);
    expect(document.body.textContent).toContain('No subfolders');
  });

  it('navigates into a subfolder and back up with the parent button', async () => {
    mountField({ modelValue: '/downloads' });
    await openPicker();
    await openFolder('movies');
    expect(folderNames()).toEqual(['2024']);
    await click(buttonNamed('Parent folder'));
    expect(qbit.getDirectoryContent).toHaveBeenLastCalledWith('/downloads');
    expect(folderNames()).toEqual(['movies', 'tv']);
  });

  it('disables the parent button at the root', async () => {
    mountField({ modelValue: '/' });
    await openPicker();
    expect(buttonNamed('Parent folder')!.disabled).toBe(true);
  });

  it('keeps the list and shows the error when a subfolder cannot be opened', async () => {
    mountField({ modelValue: '/downloads' });
    await openPicker();
    qbit.getDirectoryContent.mockClear();
    qbit.getDirectoryContent.mockRejectedValue(notFound());
    await openFolder('tv');
    expect(qbit.getDirectoryContent).toHaveBeenCalledTimes(1);
    expect(alertText()).toBe('Not found');
    expect(folderNames()).toEqual(['movies', 'tv']);
  });

  it('writes the browsed folder to the model and closes on Use this folder', async () => {
    const w = mountField({ modelValue: '/downloads' });
    await openPicker();
    await openFolder('movies');
    await click(buttonNamed('Use this folder'));
    expect(w.emitted('update:modelValue')).toEqual([['/downloads/movies']]);
    expect(input().value).toBe('/downloads/movies');
    expect(pickerOpen()).toBe(false);
  });

  it('leaves the model alone and closes on Cancel', async () => {
    const w = mountField({ modelValue: '/downloads' });
    await openPicker();
    await openFolder('movies');
    await click(buttonNamed('Cancel'));
    expect(w.emitted('update:modelValue')).toBeUndefined();
    expect(pickerOpen()).toBe(false);
  });

  it('starts from the new typed path when reopened', async () => {
    const w = mountField({ modelValue: '/downloads' });
    await openPicker();
    await click(buttonNamed('Cancel'));
    await w.get('#path').setValue('/media');
    qbit.getDirectoryContent.mockClear();
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/media');
  });

  it('ignores the response of a superseded request', async () => {
    mountField({ modelValue: '/downloads' });
    await openPicker();
    let resolveSlow!: (entries: string[]) => void;
    qbit.getDirectoryContent.mockImplementation((path: string) =>
      path === '/downloads/movies'
        ? new Promise<string[]>((resolve) => (resolveSlow = resolve))
        : Promise.resolve(TREE[path]),
    );
    await openFolder('movies');
    await click(buttonNamed('Cancel'));
    await openPicker();
    expect(folderNames()).toEqual(['movies', 'tv']);
    resolveSlow(['/downloads/movies/stale']);
    await flushPromises();
    expect(folderNames()).toEqual(['movies', 'tv']);
  });
});

describe('HostPathInput placeholder', () => {
  it('renders the placeholder and forwards attrs to the input', () => {
    wrapper = mount(HostPathInput, {
      props: { id: 'path', label: 'Save path', modelValue: '', placeholder: '/downloads' },
      attrs: { autofocus: true },
      attachTo: document.body,
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
    expect(input().placeholder).toBe('/downloads');
    expect(input().autofocus).toBe(true);
  });

  it('opens the picker at an absolute placeholder while empty', async () => {
    mountField({ placeholder: '/downloads' });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/downloads');
    expect(folderNames()).toEqual(['movies', 'tv']);
  });

  it('opens the picker at the root for a non-absolute placeholder', async () => {
    mountField({ placeholder: 'Default save path' });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledTimes(1);
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/');
  });

  it('prefers the typed value over the placeholder', async () => {
    mountField({ modelValue: '/media', placeholder: '/downloads' });
    await openPicker();
    expect(qbit.getDirectoryContent).toHaveBeenCalledWith('/media');
    expect(qbit.getDirectoryContent).not.toHaveBeenCalledWith('/downloads');
  });

  it('does not write the placeholder to the model when the picker is cancelled', async () => {
    const w = mountField({ placeholder: '/downloads' });
    await openPicker();
    await click(buttonNamed('Cancel'));
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('HostPathInput inside a form', () => {
  it('does not submit the form when browsing, navigating, cancelling or choosing', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const form = document.createElement('form');
    form.addEventListener('submit', onSubmit);
    document.body.append(form);
    wrapper = mount(HostPathInput, {
      props: { id: 'path', label: 'Default save path', modelValue: '/downloads' },
      attachTo: form,
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
    await openPicker();
    await openFolder('movies');
    await click(buttonNamed('Parent folder'));
    await click(buttonNamed('Cancel'));
    await openPicker();
    await click(buttonNamed('Use this folder'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('HostPathInput free space', () => {
  beforeEach(() => vi.useFakeTimers());

  const settle = async (ms = 400) => {
    await vi.advanceTimersByTimeAsync(ms);
    await flushPromises();
  };
  const hint = () => document.body.textContent;

  it('shows the free space of an absolute path once typing pauses', async () => {
    const w = mountField({ modelValue: '/downloads', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).toHaveBeenCalledWith('/downloads');
    expect(hint()).toContain('1.00 GiB free');
    qbit.getFreeSpaceAtPath.mockResolvedValue(2 * 1024 ** 3);
    await w.get('#path').setValue('/media');
    await settle(399);
    expect(qbit.getFreeSpaceAtPath).not.toHaveBeenCalledWith('/media');
    await settle(1);
    expect(qbit.getFreeSpaceAtPath).toHaveBeenCalledWith('/media');
    expect(hint()).toContain('2.00 GiB free');
  });

  it('asks only once for a burst of edits', async () => {
    const w = mountField({ modelValue: '/a', showFreeSpace: true });
    await settle();
    qbit.getFreeSpaceAtPath.mockClear();
    for (const value of ['/ab', '/abc', '/abcd']) {
      await w.get('#path').setValue(value);
      await settle(100);
    }
    await settle();
    expect(qbit.getFreeSpaceAtPath.mock.calls).toEqual([['/abcd']]);
  });

  it('shows nothing unless showFreeSpace is set', async () => {
    mountField({ modelValue: '/downloads' });
    await settle();
    expect(qbit.getFreeSpaceAtPath).not.toHaveBeenCalled();
    expect(hint()).not.toContain('free');
  });

  it('does not ask a WebAPI older than 2.15.2', async () => {
    useAppStore().webApiVersion = '2.15.1';
    mountField({ modelValue: '/downloads', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).not.toHaveBeenCalled();
    expect(hint()).not.toContain('free');
  });

  it('asks a WebAPI of exactly 2.15.2', async () => {
    useAppStore().webApiVersion = '2.15.2';
    mountField({ modelValue: '/downloads', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).toHaveBeenCalledWith('/downloads');
  });

  it('asks for the placeholder path while empty, and the typed value once entered', async () => {
    const w = mountField({ placeholder: '/downloads', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).toHaveBeenCalledWith('/downloads');
    expect(hint()).toContain('1.00 GiB free');
    await w.get('#path').setValue('/media');
    await settle();
    expect(qbit.getFreeSpaceAtPath).toHaveBeenLastCalledWith('/media');
  });

  it('does not ask for a non-absolute placeholder', async () => {
    mountField({ placeholder: 'Default save path', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).not.toHaveBeenCalled();
  });

  it.each(['', 'relative/dir'])('does not ask for %j', async (typed) => {
    mountField({ modelValue: typed, showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).not.toHaveBeenCalled();
  });

  it('hides a negative value', async () => {
    qbit.getFreeSpaceAtPath.mockResolvedValue(-1);
    mountField({ modelValue: '/downloads', showFreeSpace: true });
    await settle();
    expect(qbit.getFreeSpaceAtPath).toHaveBeenCalled();
    expect(hint()).not.toContain('free');
  });

  it('shows no hint and no error when the request fails', async () => {
    qbit.getFreeSpaceAtPath.mockRejectedValue(new QbtHttpError(500, 'boom'));
    mountField({ modelValue: '/downloads', showFreeSpace: true });
    await settle();
    expect(hint()).not.toContain('free');
  });
});
