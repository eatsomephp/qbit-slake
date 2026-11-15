import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import qbit from '@/services/qbit';
import { DETAILS_PANEL_ID } from '@/lib/keyboardTargets';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useSelectionStore } from '@/stores/selection';
import { UNDO_KEYS, useToastsStore } from '@/stores/toasts';
import { useTorrentsStore } from '@/stores/torrents';
import { DETAILS_TABS, useUiStore, type ColorScheme, type TableView } from '@/stores/ui';
import { useCopyText } from '@/composables/useCopyText';
import { openAdd } from '@/features/add/addState';
import { openManage } from '@/features/manage/manageState';
import { COPY_FIELDS, copyTextOf } from '@/features/torrents/copyFields';
import { rowsInView } from '@/features/torrents/tableViewport';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { QueueMove } from '@/types/app';
import { keyState, useKeymap, type Binding, type KeyGroup, type RunContext } from './engine';
import { FILTER_KEY_GROUPS, useFilterBindings } from './filterBindings';
import { cheatSheetBinding, gotoBindings } from './pageShortcuts';

const TABLE_VIEWS: TableView[] = ['stacked', 'comfortable', 'compact'];
const COLOR_SCHEMES: ColorScheme[] = ['system', 'light', 'dark'];

function nextInCycle<T>(values: readonly T[], current: T, step = 1): T {
  const index = values.indexOf(current);
  return values[(index + step + values.length) % values.length]!;
}

export const KEY_GROUPS: KeyGroup[] = [
  { keys: 'g', label: 'Go to' },
  { keys: 'y', label: 'Copy' },
  { keys: 'c', label: 'Change' },
  { keys: 'd', label: 'Delete' },
  { keys: '<Space>', label: 'Leader' },
  { keys: '<Space>q', label: 'Queue' },
  { keys: '<Space>u', label: 'Interface' },
  ...FILTER_KEY_GROUPS,
];

export function useShortcuts() {
  const app = useAppStore();
  const router = useRouter();
  const torrents = useTorrentsStore();
  const selection = useSelectionStore();
  const ui = useUiStore();
  const toasts = useToastsStore();
  const actions = useTorrentActions();
  const copyText = useCopyText();

  const hasSelection = () => selection.size > 0;
  const hasRows = () => torrents.filteredSorted.length > 0;
  const selectedTorrents = () =>
    selection.hashes.map((h) => torrents.get(h)).filter((t) => t !== undefined);

  function moveCursor(to: (index: number, length: number) => number, { extend }: RunContext) {
    const rows = torrents.filteredSorted;
    if (!rows.length) return;
    const current = selection.focused ? rows.findIndex((t) => t.hash === selection.focused) : -1;
    const next = rows[Math.min(Math.max(to(current, rows.length), 0), rows.length - 1)]!;
    if (extend && selection.anchor) selection.selectRange(next.hash, rows);
    else selection.selectOnly(next.hash);
  }

  function moveCursorOnly(step: 1 | -1, { count }: RunContext) {
    const rows = torrents.filteredSorted;
    if (!rows.length) return;
    const current = selection.focused ? rows.findIndex((t) => t.hash === selection.focused) : -1;
    const target = current < 0 ? 0 : current + step * (count ?? 1);
    selection.moveCursor(rows[Math.min(Math.max(target, 0), rows.length - 1)]!.hash);
  }

  const halfPage = () => Math.max(1, Math.floor(rowsInView.value / 2));

  function motion(
    keys: string,
    fallbacks: string[],
    label: string,
    to: (index: number, length: number, count: number | null) => number,
  ): Binding {
    return {
      keys,
      fallbacks,
      label,
      section: 'navigate',
      isMotion: true,
      isEnabled: hasRows,
      run: (context) => moveCursor((index, length) => to(index, length, context.count), context),
    };
  }

  function toggleVisual({ wasVisual }: RunContext) {
    if (wasVisual) return;
    const rows = torrents.filteredSorted;
    const cursor = selection.focused ?? rows[0]?.hash;
    if (!cursor) return;
    selection.selectOnly(cursor);
    keyState.isVisual = true;
  }

  function toggleStartStop() {
    const selected = selectedTorrents();
    if (selected.every((t) => t.isStopped)) void actions.start(selection.hashes);
    else void actions.stop(selection.hashes);
  }

  function toggleForceStart() {
    const allForced = selectedTorrents().every((t) => t.forceStart);
    void actions.setForceStart(selection.hashes, !allForced);
  }

  function toggleAutoTmm() {
    if (selectedTorrents().every((t) => t.autoTmm))
      void actions.setAutoManagement(selection.hashes, false);
    else openManage({ kind: 'enableAutoTmm', hashes: selection.hashes });
  }

  function stepDetailsTab(step: 1 | -1) {
    ui.detailsTab = nextInCycle(DETAILS_TABS, ui.detailsTab, step);
    ui.detailsOpen = true;
  }

  async function focusDetailsPanel() {
    if (!selection.size && selection.focused) selection.selectOnly(selection.focused);
    ui.expandDetails();
    await nextTick();
    document.getElementById(DETAILS_PANEL_ID)?.focus();
  }

  function backOut({ wasVisual }: RunContext) {
    if (wasVisual) return;
    if (selection.size) selection.clear();
    else if (ui.detailsOpen) ui.detailsOpen = false;
  }

  function openActionMenu() {
    const hash = selection.focused ?? selection.hashes[0];
    const row = hash && document.querySelector<HTMLElement>(`[data-hash="${hash}"]`);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    row.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + Math.min(rect.width / 3, 240),
        clientY: rect.bottom,
      }),
    );
  }

  function queueMove(keys: string, move: QueueMove, label: string): Binding {
    return {
      keys,
      label,
      section: 'torrent',
      isAvailable: () => torrents.serverState.queueing,
      isEnabled: () => selectedTorrents().some((t) => t.priority > 0),
      run: () => void actions.moveInQueue(selection.hashes, move),
    };
  }

  const toggleAltSpeed = () =>
    void actions.perform('Toggle alternative speed limits', () => qbit.toggleAltSpeedLimits());

  const toggleSessionPause = () =>
    void actions.setSessionPaused(!torrents.serverState.session_state);

  const bindings: Binding[] = [
    motion('j', ['<Down>'], 'Next torrent', (i, _, count) => i + (count ?? 1)),
    motion('k', ['<Up>'], 'Previous torrent', (i, _, count) => (i < 0 ? 0 : i - (count ?? 1))),
    motion('gg', ['<Home>'], 'First torrent (or row N)', (_, __, count) => (count ?? 1) - 1),
    motion('G', ['<End>'], 'Last torrent (or row N)', (_, length, count) =>
      count === null ? length - 1 : count - 1,
    ),
    motion('<C-d>', ['<PageDown>'], 'Half a page down', (i) => i + halfPage()),
    motion('<C-u>', ['<PageUp>'], 'Half a page up', (i) => (i < 0 ? 0 : i - halfPage())),

    {
      keys: 'v',
      label: 'Visual mode: moving extends the selection',
      section: 'select',
      isEnabled: hasRows,
      run: toggleVisual,
    },
    {
      keys: '<C-j>',
      fallbacks: ['<C-Down>'],
      label: 'Move the cursor down without selecting',
      section: 'select',
      isEnabled: hasRows,
      run: (context) => moveCursorOnly(1, context),
    },
    {
      keys: '<C-k>',
      fallbacks: ['<C-Up>'],
      label: 'Move the cursor up without selecting',
      section: 'select',
      isEnabled: hasRows,
      run: (context) => moveCursorOnly(-1, context),
    },
    {
      keys: 'm',
      fallbacks: ['<C-Space>'],
      label: 'Add or remove the cursor row',
      section: 'select',
      isEnabled: () => selection.focused !== null,
      run: () => selection.toggle(selection.focused!),
    },
    {
      keys: '<Space>a',
      fallbacks: ['<Mod-a>'],
      label: 'Select all visible torrents',
      section: 'select',
      isEnabled: hasRows,
      run: () => selection.selectAll(torrents.filteredSorted),
    },
    {
      keys: '<Space>i',
      label: 'Invert the selection',
      section: 'select',
      isEnabled: hasRows,
      run: () => selection.invert(torrents.filteredSorted),
    },
    {
      keys: '<Esc>',
      label: 'Leave visual mode, clear the selection, then close details',
      section: 'select',
      run: backOut,
    },

    {
      keys: 'o',
      fallbacks: ['<Enter>'],
      label: 'Open details',
      section: 'details',
      isEnabled: () => selection.focused !== null || hasSelection(),
      run: () => ui.expandDetails(),
    },
    {
      keys: 'q',
      label: 'Close details',
      section: 'details',
      isEnabled: () => ui.detailsOpen && hasSelection(),
      run: () => (ui.detailsOpen = false),
    },
    {
      keys: 'gt',
      label: 'Next details tab',
      section: 'details',
      isEnabled: hasSelection,
      run: () => stepDetailsTab(1),
    },
    {
      keys: 'gT',
      label: 'Previous details tab',
      section: 'details',
      isEnabled: hasSelection,
      run: () => stepDetailsTab(-1),
    },
    {
      keys: 'l',
      fallbacks: ['<Right>'],
      label: 'Show the next selected torrent in details',
      section: 'details',
      isEnabled: () => selection.size > 1,
      run: () => selection.viewStep(1, torrents.filteredSorted),
    },
    {
      keys: 'h',
      fallbacks: ['<Left>'],
      label: 'Show the previous selected torrent in details',
      section: 'details',
      isEnabled: () => selection.size > 1,
      run: () => selection.viewStep(-1, torrents.filteredSorted),
    },

    {
      keys: 's',
      label: 'Start or stop',
      section: 'torrent',
      isEnabled: hasSelection,
      run: toggleStartStop,
    },
    {
      keys: 'dd',
      fallbacks: ['<Del>', '<BS>'],
      label: 'Delete…',
      section: 'torrent',
      isEnabled: hasSelection,
      run: () => actions.confirmDelete(selection.hashes),
    },
    {
      keys: '<Space>m',
      fallbacks: ['<ContextMenu>', '<S-F10>'],
      label: 'Open the action menu',
      section: 'torrent',
      isEnabled: hasSelection,
      run: openActionMenu,
    },
    {
      keys: '<Space>f',
      label: 'Toggle force start',
      section: 'torrent',
      isEnabled: hasSelection,
      run: toggleForceStart,
    },
    {
      keys: '<Space>R',
      label: 'Force recheck',
      section: 'torrent',
      isEnabled: hasSelection,
      run: () => void actions.recheck(selection.hashes),
    },
    {
      keys: '<Space>r',
      label: 'Force reannounce',
      section: 'torrent',
      isEnabled: hasSelection,
      run: () => void actions.reannounce(selection.hashes),
    },
    {
      keys: '<Space>x',
      label: 'Export .torrent',
      section: 'torrent',
      isEnabled: hasSelection,
      run: () => void actions.exportTorrents(selectedTorrents()),
    },
    queueMove('<Space>qg', 'top', 'Move to top'),
    queueMove('<Space>qk', 'up', 'Move up'),
    queueMove('<Space>qj', 'down', 'Move down'),
    queueMove('<Space>qG', 'bottom', 'Move to bottom'),
    {
      keys: '<Space>s',
      label: 'Start all torrents',
      section: 'torrent',
      isEnabled: () => torrents.all.some((t) => t.isStopped),
      run: () => void actions.startAll(),
    },
    {
      keys: '<Space>S',
      label: 'Stop all torrents',
      section: 'torrent',
      isEnabled: () => torrents.all.some((t) => !t.isStopped),
      run: () => void actions.stopAll(),
    },

    {
      keys: 'cn',
      label: 'Rename…',
      section: 'change',
      isEnabled: () => selection.size === 1,
      run: () => openManage({ kind: 'rename', hash: selection.hashes[0]! }),
    },
    {
      keys: 'ct',
      label: 'Add tags…',
      section: 'change',
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'tags', applyTo: selection.hashes }),
    },
    {
      keys: 'cl',
      label: 'Set location…',
      section: 'change',
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'location', hashes: selection.hashes }),
    },
    {
      keys: 'ci',
      label: 'Set incomplete path…',
      section: 'change',
      isEnabled: () => hasSelection() && !selectedTorrents().every((t) => t.autoTmm),
      run: () => openManage({ kind: 'downloadPath', hashes: selection.hashes }),
    },
    {
      keys: 'ca',
      label: 'Toggle automatic torrent management',
      section: 'change',
      isEnabled: hasSelection,
      run: toggleAutoTmm,
    },
    {
      keys: 'cm',
      label: 'Edit comment…',
      section: 'change',
      isAvailable: () => app.isApiAvailable(API.setComment),
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'comment', hashes: selection.hashes }),
    },
    {
      keys: 'cr',
      label: 'Replace tracker URL…',
      section: 'change',
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'replaceTracker', hashes: selection.hashes }),
    },
    {
      keys: 'cs',
      label: 'Speed limits…',
      section: 'change',
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'speedLimits', hashes: selection.hashes }),
    },
    {
      keys: 'cS',
      label: 'Share limits…',
      section: 'change',
      isEnabled: hasSelection,
      run: () => openManage({ kind: 'shareLimits', hashes: selection.hashes }),
    },

    ...COPY_FIELDS.map((field): Binding => ({
      keys: `y${field.key}`,
      label: field.label,
      section: 'copy',
      isEnabled: () => selectedTorrents().some((t) => field.value(t)),
      run: () => void copyText(copyTextOf(field, selectedTorrents())),
    })),

    {
      keys: 'gd',
      label: 'Focus the details panel',
      section: 'details',
      isEnabled: () => selection.focused !== null || hasSelection(),
      run: () => void focusDetailsPanel(),
    },
    ...gotoBindings(router),

    {
      keys: UNDO_KEYS,
      fallbacks: ['<Mod-z>'],
      label: 'Undo the last action',
      section: 'app',
      isEnabled: () => toasts.canUndo(),
      run: () => toasts.undoLatest(),
    },
    { keys: 'a', label: 'Add torrents', section: 'app', run: () => openAdd() },
    {
      keys: '/',
      label: 'Focus the filter box',
      section: 'app',
      run: () => document.querySelector<HTMLInputElement>('#torrent-search')?.focus(),
    },
    {
      keys: '<Space>t',
      label: 'Toggle alternative speed limits',
      section: 'app',
      run: toggleAltSpeed,
    },
    {
      keys: '<Space>p',
      label: 'Pause or resume all transfers',
      section: 'app',
      isAvailable: () => app.isApiAvailable(API.pauseSession),
      run: toggleSessionPause,
    },
    {
      keys: '<Space>e',
      label: 'Toggle the sidebar',
      section: 'app',
      run: () => (ui.sidebarOpen = !ui.sidebarOpen),
    },
    {
      keys: '<Space>ud',
      label: 'Toggle the details drawer',
      section: 'app',
      isEnabled: hasSelection,
      run: () => (ui.detailsOpen ? (ui.detailsOpen = false) : ui.expandDetails()),
    },
    {
      keys: '<Space>uv',
      label: 'Cycle table density',
      section: 'app',
      run: () => (ui.tableView = nextInCycle(TABLE_VIEWS, ui.tableView)),
    },
    {
      keys: '<Space>uc',
      label: 'Cycle color scheme',
      section: 'app',
      run: () => (ui.colorScheme = nextInCycle(COLOR_SCHEMES, ui.colorScheme)),
    },
    cheatSheetBinding,
  ];

  const filterBindings = useFilterBindings();
  useKeymap({
    get bindings() {
      return [...bindings, ...filterBindings.value];
    },
    groups: KEY_GROUPS,
  });
}
