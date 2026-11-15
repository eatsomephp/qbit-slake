import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { RawTracker } from '@/types/qbit';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';

const qbit = vi.hoisted(() => ({ editTracker: vi.fn(), addTrackers: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/sync/useMaindata', () => ({ requestSync: vi.fn() }));

const { default: EditTrackerDialog } = await import('./EditTrackerDialog.vue');
const { default: AddTrackersDialog } = await import('./AddTrackersDialog.vue');
const { QbtHttpError } = await import('@/services/qbit');

const tracker: RawTracker = {
  url: 'http://t.example/ann',
  status: 2,
  tier: 1,
  num_peers: 0,
  num_seeds: 0,
  num_leeches: 0,
  num_downloaded: 0,
  msg: '',
};

let wrapper: VueWrapper | null = null;

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
const field = (selector: string) => document.querySelector<HTMLInputElement>(selector)!;
async function type(selector: string, value: string) {
  const el = field(selector);
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await flushPromises();
}

function mountEdit(canEditTier = true) {
  vi.spyOn(useAppStore(), 'isApiAvailable').mockReturnValue(canEditTier);
  wrapper = mount(EditTrackerDialog, {
    props: { hash: 'h1', tracker, open: true },
    attachTo: document.body,
  });
  return flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  qbit.editTracker.mockResolvedValue(undefined);
  qbit.addTrackers.mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('EditTrackerDialog', () => {
  it('starts with Save disabled because nothing changed', async () => {
    await mountEdit();
    expect(button('Save').disabled).toBe(true);
  });

  it('sends only the changed fields', async () => {
    await mountEdit();
    await type('#edit-tracker-url', ' http://u.example/ann ');
    button('Save').click();
    await flushPromises();
    expect(qbit.editTracker).toHaveBeenCalledWith('h1', tracker.url, {
      newUrl: 'http://u.example/ann',
    });
    expect(wrapper!.emitted('changed')).toHaveLength(1);
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false]);
  });

  it('sends a tier change as a number', async () => {
    await mountEdit();
    await type('#edit-tracker-tier', '3');
    button('Save').click();
    await flushPromises();
    expect(qbit.editTracker).toHaveBeenCalledWith('h1', tracker.url, { tier: 3 });
  });

  it.each(['', '-1', '256', '1.5'])('refuses tier %j', async (value) => {
    await mountEdit();
    await type('#edit-tracker-tier', value);
    await type('#edit-tracker-url', 'http://u.example/ann');
    expect(button('Save').disabled).toBe(true);
  });

  it('hides the tier field on servers that cannot edit it', async () => {
    await mountEdit(false);
    expect(document.querySelector('#edit-tracker-tier')).toBeNull();
    await type('#edit-tracker-url', 'http://u.example/ann');
    expect(button('Save').disabled).toBe(false);
  });

  it('refuses an empty URL', async () => {
    await mountEdit();
    await type('#edit-tracker-url', '  ');
    expect(button('Save').disabled).toBe(true);
  });

  it('stays open and toasts when the request fails', async () => {
    qbit.editTracker.mockRejectedValue(new QbtHttpError(409, 'Duplicate'));
    await mountEdit();
    await type('#edit-tracker-url', 'http://u.example/ann');
    button('Save').click();
    await flushPromises();
    expect(wrapper!.emitted('changed')).toBeUndefined();
    expect(wrapper!.emitted('update:open')).toBeUndefined();
    expect(useToastsStore().toasts.at(-1)?.message).toBe('Edit tracker failed: Duplicate');
  });
});

describe('AddTrackersDialog', () => {
  function mountAdd() {
    wrapper = mount(AddTrackersDialog, {
      props: { hash: 'h1', open: true },
      attachTo: document.body,
    });
    return flushPromises();
  }

  it('disables the button until some text is entered', async () => {
    await mountAdd();
    expect(button('Add trackers').disabled).toBe(true);
    await type('textarea', '   ');
    expect(button('Add trackers').disabled).toBe(true);
  });

  it('submits the raw text, then notifies and closes', async () => {
    await mountAdd();
    await type('textarea', 'http://a/ann\n\nhttp://b/ann');
    button('Add trackers').click();
    await flushPromises();
    expect(qbit.addTrackers).toHaveBeenCalledWith('h1', 'http://a/ann\n\nhttp://b/ann');
    expect(wrapper!.emitted('changed')).toHaveLength(1);
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false]);
  });

  it('submits on Ctrl+Enter but not on a bare Enter', async () => {
    await mountAdd();
    await type('textarea', 'http://a/ann');
    const area = field('textarea');
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();
    expect(qbit.addTrackers).not.toHaveBeenCalled();
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    await flushPromises();
    expect(qbit.addTrackers).toHaveBeenCalledTimes(1);
  });

  it('stays open when the request fails', async () => {
    qbit.addTrackers.mockRejectedValue(new QbtHttpError(400, 'Bad URL'));
    await mountAdd();
    await type('textarea', 'nope');
    button('Add trackers').click();
    await flushPromises();
    expect(wrapper!.emitted('changed')).toBeUndefined();
    expect(useToastsStore().toasts.at(-1)?.message).toBe('Add trackers failed: Bad URL');
  });
});
