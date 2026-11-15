import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';

const qbit = vi.hoisted(() => ({ editTracker: vi.fn(), removeTrackers: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
const requestSync = vi.hoisted(() => vi.fn());
vi.mock('@/sync/useMaindata', () => ({ requestSync }));

const { default: ManageDialogs } = await import('./ManageDialogs.vue');
const { closeManage, manage, openManage } = await import('./manageState');
const { QbtHttpError } = await import('@/services/qbit');

let wrapper: VueWrapper | null = null;

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
const input = (index: number) =>
  document.querySelectorAll<HTMLInputElement>('[role=dialog] input')[index]!;
async function type(index: number, value: string) {
  input(index).value = value;
  input(index).dispatchEvent(new Event('input'));
  await flushPromises();
}
const summary = () => document.querySelector('p.mr-auto[aria-live=polite]')!.textContent!.trim();

function seedTrackers(trackers: Record<string, string[]>) {
  useTorrentsStore().apply({ rid: 1, full_update: true, trackers });
}

async function open(hashes: string[], find?: string) {
  openManage({ kind: 'replaceTracker', hashes, find });
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  qbit.editTracker.mockResolvedValue(undefined);
  qbit.removeTrackers.mockResolvedValue(undefined);
  wrapper = mount(ManageDialogs, { attachTo: document.body });
});
afterEach(() => {
  wrapper?.unmount();
  closeManage();
  document.body.innerHTML = '';
});

describe('ReplaceTrackerDialog', () => {
  it('lists the trackers of the selected torrents only, most used first', async () => {
    seedTrackers({ 'http://a/ann': ['h1'], 'http://b/ann': ['h1', 'h2'], 'http://c/ann': ['h3'] });
    await open(['h1', 'h2']);
    const urls = [...document.querySelectorAll('li button')].map((b) =>
      b.querySelector('span span')!.textContent!.trim(),
    );
    expect(urls).toEqual(['http://b/ann', 'http://a/ann']);
  });

  it('says so when the selection has no trackers and keeps Replace disabled', async () => {
    seedTrackers({});
    await open(['h1']);
    expect(document.body.textContent).toContain('These torrents have no trackers.');
    expect(button('Replace').disabled).toBe(true);
  });

  it('prefills find and previews the change in the summary', async () => {
    seedTrackers({ 'http://old.example/ann': ['h1', 'h2'] });
    await open(['h1', 'h2'], 'old.example');
    await type(1, 'new.example');
    expect(summary()).toBe('1 tracker URL on 2 torrents');
    expect(document.body.textContent).toContain('http://new.example/ann');
    expect(button('Replace').disabled).toBe(false);
  });

  it('reports when nothing would change', async () => {
    seedTrackers({ 'http://old.example/ann': ['h1'] });
    await open(['h1']);
    await type(0, 'zzz');
    expect(summary()).toBe('No tracker URLs change.');
    expect(button('Replace').disabled).toBe(true);
  });

  it('clicking a tracker URL fills Find with it', async () => {
    seedTrackers({ 'http://old.example/ann': ['h1'] });
    await open(['h1']);
    document.querySelector<HTMLButtonElement>('li button')!.click();
    await flushPromises();
    expect(input(0).value).toBe('http://old.example/ann');
  });

  it('edits each torrent, removes when the new URL already exists, then syncs and closes', async () => {
    seedTrackers({ 'http://old/ann': ['h1', 'h2'], 'http://new/ann': ['h2'] });
    await open(['h1', 'h2'], 'old');
    await type(1, 'new');
    button('Replace').click();
    await flushPromises();
    expect(qbit.editTracker).toHaveBeenCalledTimes(1);
    expect(qbit.editTracker).toHaveBeenCalledWith('h1', 'http://old/ann', {
      newUrl: 'http://new/ann',
    });
    expect(qbit.removeTrackers).toHaveBeenCalledWith('h2', ['http://old/ann']);
    expect(requestSync).toHaveBeenCalledTimes(1);
    expect(manage.value).toBeNull();
  });

  it('keeps the dialog open and toasts when some torrents fail', async () => {
    seedTrackers({ 'http://old/ann': ['h1', 'h2'] });
    qbit.editTracker.mockImplementation(async (hash: string) => {
      if (hash === 'h2') throw new QbtHttpError(409, 'Conflict');
    });
    await open(['h1', 'h2'], 'old');
    await type(1, 'new');
    button('Replace').click();
    await flushPromises();
    expect(manage.value).not.toBeNull();
    expect(useToastsStore().toasts.at(-1)?.message).toBe(
      'Replace tracker URL failed on 1 torrent: Conflict',
    );
    expect(requestSync).toHaveBeenCalled();
  });

  it('stops quietly when signed out (403)', async () => {
    seedTrackers({ 'http://old/ann': ['h1'] });
    qbit.editTracker.mockRejectedValue(new QbtHttpError(403, ''));
    await open(['h1'], 'old');
    await type(1, 'new');
    button('Replace').click();
    await flushPromises();
    expect(useToastsStore().toasts).toHaveLength(0);
    expect(requestSync).not.toHaveBeenCalled();
    expect(manage.value).not.toBeNull();
  });
});
