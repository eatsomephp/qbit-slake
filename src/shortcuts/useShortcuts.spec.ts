import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { TorrentState } from '@/constants/qbit';
import { DETAILS_PANEL_ID } from '@/lib/keyboardTargets';
import { closeManage, manage } from '@/features/manage/manageState';
import { deleteRequest } from '@/features/torrents/useTorrentActions';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';

const push = vi.hoisted(() => vi.fn());
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
const qbit = vi.hoisted(() => ({
  startTorrents: vi.fn().mockResolvedValue(undefined),
  stopTorrents: vi.fn().mockResolvedValue(undefined),
  setForceStart: vi.fn().mockResolvedValue(undefined),
  toggleAltSpeedLimits: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/sync/useMaindata', () => ({ requestSync: vi.fn() }));

const { keyState, resetPending, activeKeymaps, cheatSheetEntries } = await import('./engine');
const { useShortcuts, KEY_GROUPS } = await import('./useShortcuts');

const mounted: VueWrapper[] = [];

const press = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const type = (text: string) => [...text].forEach((c) => press(c));

function seed(states: TorrentState[] = []) {
  const torrents: Record<string, object> = {};
  const all = states.length ? states : Array(5).fill(TorrentState.Downloading);
  all.forEach((state, i) => {
    torrents[`h${i}`] = { ...DEFAULT_RAW_TORRENT, name: `t${i}`, added_on: 100 - i, state };
  });
  useTorrentsStore().apply({ rid: 1, full_update: true, torrents });
}

function setup(states?: TorrentState[]) {
  seed(states);
  mounted.push(
    mount(
      defineComponent({
        setup() {
          useShortcuts();
          return () => h('i');
        },
      }),
    ),
  );
  const selection = useSelectionStore();
  const ui = useUiStore();
  return { selection, ui, order: () => useTorrentsStore().filteredSorted.map((t) => t.hash) };
}

const selected = () => [...useSelectionStore().selected].sort();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  deleteRequest.open = false;
  deleteRequest.hashes = [];
});

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  resetPending();
  keyState.isVisual = false;
  closeManage();
});

describe('navigation', () => {
  it('j selects the first row, then steps down by count and clamps', () => {
    const { selection, order } = setup();
    press('j');
    expect(selection.focused).toBe(order()[0]);
    type('2j');
    expect(selection.focused).toBe(order()[2]);
    type('50j');
    expect(selection.focused).toBe(order()[4]);
    expect(selected()).toEqual([order()[4]]);
  });

  it('k from no cursor lands on the first row', () => {
    const { selection, order } = setup();
    press('k');
    expect(selection.focused).toBe(order()[0]);
  });

  it('gg, G and counted G jump', () => {
    const { selection, order } = setup();
    press('G');
    expect(selection.focused).toBe(order()[4]);
    press('g');
    press('g');
    expect(selection.focused).toBe(order()[0]);
    type('3G');
    expect(selection.focused).toBe(order()[2]);
    type('2');
    press('g');
    press('g');
    expect(selection.focused).toBe(order()[1]);
  });

  it('arrow keys and Home/End work as fallbacks', () => {
    const { selection, order } = setup();
    press('ArrowDown');
    press('ArrowDown');
    expect(selection.focused).toBe(order()[1]);
    press('End');
    expect(selection.focused).toBe(order()[4]);
    press('Home');
    expect(selection.focused).toBe(order()[0]);
  });

  it('shift plus an arrow extends the selection as a range', () => {
    const { order } = setup();
    press('ArrowDown');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(selected()).toEqual(order().slice(0, 3).sort());
  });

  it('visual mode extends with motions and Esc leaves it before clearing', () => {
    const { selection, order } = setup();
    press('j');
    press('v');
    expect(keyState.isVisual).toBe(true);
    type('2j');
    expect(selected()).toEqual(order().slice(0, 3).sort());
    press('Escape');
    expect(keyState.isVisual).toBe(false);
    expect(selection.size).toBe(3);
    press('Escape');
    expect(selection.size).toBe(0);
  });

  it('Ctrl-j moves the cursor without changing the selection and m toggles the row', () => {
    const { selection, order } = setup();
    press('j');
    press('j', { ctrlKey: true });
    expect(selection.focused).toBe(order()[1]);
    expect(selected()).toEqual([order()[0]]);
    press('m');
    expect(selected()).toEqual([order()[0], order()[1]].sort());
  });

  it('Space a selects all and Space i inverts', () => {
    const { order } = setup();
    press(' ');
    press('a');
    expect(selected()).toEqual([...order()].sort());
    press(' ');
    press('i');
    expect(selected()).toEqual([]);
  });

  it('Esc closes details when nothing is selected', () => {
    const { ui } = setup();
    ui.detailsOpen = true;
    press('Escape');
    expect(ui.detailsOpen).toBe(false);
  });
});

describe('guards on selection', () => {
  it('does not swallow selection-only keys as actions when nothing is selected', () => {
    setup();
    press('s');
    expect(qbit.startTorrents).not.toHaveBeenCalled();
    expect(qbit.stopTorrents).not.toHaveBeenCalled();
    press('d');
    press('d');
    expect(deleteRequest.open).toBe(false);
  });

  it('does nothing on an empty list', () => {
    const { selection } = setup();
    useTorrentsStore().reset();
    press('j');
    press('G');
    expect(selection.size).toBe(0);
  });
});

describe('torrent actions', () => {
  it('s stops running torrents and starts when all are stopped', async () => {
    const { selection } = setup([TorrentState.Downloading, TorrentState.StoppedDL]);
    selection.selectOnly('h0');
    press('s');
    await flushPromises();
    expect(qbit.stopTorrents).toHaveBeenCalledWith(['h0']);
    selection.selectOnly('h1');
    press('s');
    await flushPromises();
    expect(qbit.startTorrents).toHaveBeenCalledWith(['h1']);
  });

  it('dd and Delete open the delete confirmation for the selection', () => {
    const { selection } = setup();
    selection.selectOnly('h0');
    press('d');
    press('d');
    expect(deleteRequest).toMatchObject({ open: true, hashes: ['h0'] });
    deleteRequest.open = false;
    press('Delete');
    expect(deleteRequest.open).toBe(true);
  });

  it('opens management dialogs with the selection', () => {
    const { selection } = setup();
    selection.selectOnly('h0');
    press('c');
    press('n');
    expect(manage.value).toEqual({ kind: 'rename', hash: 'h0' });
    closeManage();
    press('c');
    press('t');
    expect(manage.value).toEqual({ kind: 'tags', applyTo: ['h0'] });
  });

  it('rename needs exactly one selected torrent', () => {
    const { selection } = setup();
    selection.selectOnly('h0');
    selection.toggle('h1');
    press('c');
    press('n');
    expect(manage.value).toBeNull();
  });

  it('queue bindings are unavailable unless queueing is on', () => {
    setup();
    const keys = activeKeymaps()[0]!.bindings.filter((b) => b.keys.startsWith('<Space>q'));
    expect(keys).toHaveLength(4);
    expect(keys.every((b) => b.isAvailable!() === false)).toBe(true);
    useTorrentsStore().apply({ rid: 2, server_state: { queueing: true } });
    expect(keys.every((b) => b.isAvailable!())).toBe(true);
  });

  it('Space t toggles alternative speed limits', async () => {
    setup();
    press(' ');
    press('t');
    await flushPromises();
    expect(qbit.toggleAltSpeedLimits).toHaveBeenCalledOnce();
  });
});

describe('details and app shortcuts', () => {
  it('o opens details, gt and gT cycle tabs', () => {
    const { selection, ui } = setup();
    selection.selectOnly('h0');
    ui.detailsOpen = false;
    press('o');
    expect(ui.detailsOpen).toBe(true);
    const first = ui.detailsTab;
    press('g');
    press('t');
    expect(ui.detailsTab).not.toBe(first);
    press('g');
    press('T');
    expect(ui.detailsTab).toBe(first);
  });

  it('gd focuses the details panel', async () => {
    const { selection } = setup();
    const panel = document.body.appendChild(document.createElement('div'));
    panel.id = DETAILS_PANEL_ID;
    panel.tabIndex = 0;
    selection.selectOnly('h0');
    press('g');
    press('d');
    await nextTick();
    expect(document.activeElement).toBe(panel);
  });

  it('gs navigates to settings', () => {
    setup();
    press('g');
    press('s');
    expect(push).toHaveBeenCalledWith({ name: 'settings' });
  });

  it('/ focuses the filter box', () => {
    setup();
    const input = document.body.appendChild(document.createElement('input'));
    input.id = 'torrent-search';
    press('/');
    expect(document.activeElement).toBe(input);
  });

  it('Space e toggles the sidebar and Space u v cycles density', () => {
    const { ui } = setup();
    const sidebar = ui.sidebarOpen;
    press(' ');
    press('e');
    expect(ui.sidebarOpen).toBe(!sidebar);
    const view = ui.tableView;
    press(' ');
    press('u');
    press('v');
    expect(ui.tableView).not.toBe(view);
  });

  it('Space u m toggles checkbox selection and Space u r reverses the sort', () => {
    const { ui } = setup();
    press(' ');
    press('u');
    press('m');
    expect(ui.multiSelect).toBe(true);
    const desc = ui.sorting[0]!.desc;
    press(' ');
    press('u');
    press('r');
    expect(ui.sorting[0]!.desc).toBe(!desc);
  });

  it('? opens the cheat sheet', () => {
    setup();
    press('?', { shiftKey: true });
    expect(manage.value).toMatchObject({ kind: 'shortcuts' });
  });

  it('filter shortcuts are part of the keymap', () => {
    const { ui } = setup();
    press('f');
    press('s');
    press('d');
    expect(ui.filters.state.include).toEqual(['downloading']);
  });
});

describe('suppression and stacking', () => {
  it('ignores shortcuts while typing in the search box', () => {
    const { selection } = setup();
    const input = document.body.appendChild(document.createElement('input'));
    press('j', {}, input);
    expect(selection.size).toBe(0);
  });

  it('ignores shortcuts while a dialog is open', () => {
    const { selection } = setup();
    document.body.appendChild(document.createElement('div')).setAttribute('role', 'dialog');
    press('j');
    expect(selection.focused).toBeNull();
  });
});

describe('cheat sheet coverage', () => {
  it('every sectioned binding is reachable and every key group has a label', () => {
    setup();
    const entries = cheatSheetEntries(activeKeymaps());
    expect(entries.length).toBeGreaterThan(30);
    expect(entries.every((e) => e.sequences.length > 0)).toBe(true);
    KEY_GROUPS.forEach((g) => expect(g.label).not.toBe(''));
  });

  it('has no duplicate primary key sequences', () => {
    setup();
    const keys = activeKeymaps()[0]!.bindings.map((b) => b.keys);
    const unique = new Set(keys);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    expect(unique.size).toBe(keys.length);
  });
});
