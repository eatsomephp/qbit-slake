import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { TorrentState } from '@/constants/qbit';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import TorrentList from './TorrentList.vue';
import { mobileDetailsOpen } from './mobileState';

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
});
afterAll(() => vi.restoreAllMocks());

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  mobileDetailsOpen.value = false;
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    torrents: {
      a: {
        ...DEFAULT_RAW_TORRENT,
        name: 'Alpha',
        size: 1024 ** 3,
        progress: 0.5,
        dlspeed: 2048,
        state: TorrentState.Downloading,
        added_on: 2,
      },
      b: { ...DEFAULT_RAW_TORRENT, name: 'Beta', added_on: 1 },
    },
  });
});

describe('TorrentList (phone)', () => {
  it('renders two-line rows with status, progress, speed and size', async () => {
    const w = mount(TorrentList);
    await flushPromises();
    const rows = w.findAll('[role=listitem]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('Alpha');
    expect(rows[0]!.text()).toContain('Downloading');
    expect(rows[0]!.text()).toContain('50.0% of 1.00 GiB');
    expect(rows[0]!.text()).toContain('↓ 2.00 KiB/s');
  });

  it('shows a limit icon in the narrow layout even when that speed is zero', async () => {
    useTorrentsStore().apply({
      rid: 2,
      torrents: { b: { up_limit: 2048 }, a: { dl_limit: 1024 } },
    });
    const w = mount(TorrentList);
    await flushPromises();
    const [alpha, beta] = w.findAll('[role=listitem]');
    expect(alpha!.findAll('[data-speed-limited]').map((i) => i.attributes('aria-label'))).toEqual([
      'Download limit: 1.00 KiB/s',
    ]);
    const betaIcons = beta!.findAll('[data-speed-limited]');
    expect(betaIcons.map((i) => i.attributes('data-tooltip'))).toEqual([
      'Upload limit: 2.00 KiB/s',
    ]);
    expect(beta!.text()).toContain('↑ 0 B/s');
    expect(beta!.text()).not.toContain('↓');
  });

  it('shows no limit icon when unlimited', async () => {
    const w = mount(TorrentList);
    await flushPromises();
    expect(w.find('[data-speed-limited]').exists()).toBe(false);
  });

  it('the circle toggles selection; the row opens details for that torrent', async () => {
    const w = mount(TorrentList);
    await flushPromises();
    await w.get('[aria-label="Select Alpha"]').trigger('click');
    await w.get('[aria-label="Select Beta"]').trigger('click');
    expect([...useSelectionStore().selected].sort()).toEqual(['a', 'b']);
    expect(mobileDetailsOpen.value).toBe(false);

    await w.findAll('[role=listitem] button')[3]!.trigger('click'); // Beta's text button
    expect([...useSelectionStore().selected]).toEqual(['b']);
    expect(useSelectionStore().focused).toBe('b');
    expect(mobileDetailsOpen.value).toBe(true);
  });

  it('closing the details clears the selection', async () => {
    const w = mount(TorrentList);
    await flushPromises();
    await w.findAll('[role=listitem] button')[1]!.trigger('click');
    expect([...useSelectionStore().selected]).toEqual(['a']);

    mobileDetailsOpen.value = false;
    await flushPromises();
    expect(useSelectionStore().size).toBe(0);
  });

  it('sort select and direction toggle drive the shared sort', async () => {
    const w = mount(TorrentList);
    await flushPromises();
    await w.get('select[aria-label="Sort by"]').setValue('name');
    expect(useUiStore().sorting).toEqual([{ id: 'name', desc: false }]);
    await flushPromises();
    expect(w.findAll('[role=listitem]')[0]!.text()).toContain('Alpha');
    await w.get('button[aria-label="Ascending"]').trigger('click');
    expect(useUiStore().sorting).toEqual([{ id: 'name', desc: true }]);
    await w.get('select[aria-label="Sort by"]').setValue('size');
    expect(useUiStore().sorting).toEqual([{ id: 'size', desc: true }]);
  });
});
