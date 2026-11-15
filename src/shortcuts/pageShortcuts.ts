import { useRouter, type Router } from 'vue-router';
import { isTyping } from '@/lib/keyboardTargets';
import { openManage } from '@/features/manage/manageState';
import { activeKeymaps, keyState, resetPending, useKeymap, type Binding } from './engine';

export function gotoBindings(router: Router): Binding[] {
  const go = (name: string) => () => void router.push({ name });
  return [
    { keys: 'gs', label: 'Settings', section: 'goto', run: go('settings') },
    { keys: 'gr', label: 'RSS', section: 'goto', run: go('rss') },
    { keys: 'ge', label: 'Search engine', section: 'goto', run: go('search') },
    { keys: 'gl', label: 'Log', section: 'goto', run: go('log') },
    { keys: 'gc', label: 'Torrent creator', section: 'goto', run: go('creator') },
  ];
}

export function openCheatSheet() {
  openManage({ kind: 'shortcuts', keymaps: activeKeymaps() });
}

export const cheatSheetBinding: Binding = {
  keys: '?',
  label: 'All keyboard shortcuts',
  section: 'app',
  run: openCheatSheet,
};

export interface PageShortcutOptions {
  dialogRoot: () => HTMLElement | null;
  close: () => void;
  stepTab?: (step: 1 | -1) => void;
  tabNoun?: string;
  focusSearch?: () => void;
  isSearchShown?: () => boolean;
}

export function usePageShortcuts(options: PageShortcutOptions) {
  const router = useRouter();
  const { stepTab, focusSearch, isSearchShown, tabNoun = 'tab' } = options;
  const tabBindings: Binding[] = stepTab
    ? [
        { keys: 'gt', label: `Next ${tabNoun}`, section: 'page', run: () => stepTab(1) },
        { keys: 'gT', label: `Previous ${tabNoun}`, section: 'page', run: () => stepTab(-1) },
      ]
    : [];
  const searchBindings: Binding[] = focusSearch
    ? [
        {
          keys: '/',
          label: 'Focus the search box',
          section: 'page',
          isAvailable: isSearchShown,
          run: focusSearch,
        },
      ]
    : [];
  useKeymap({
    bindings: [
      ...tabBindings,
      ...searchBindings,
      { keys: 'q', label: 'Close', section: 'page', run: options.close },
      ...gotoBindings(router),
      cheatSheetBinding,
    ],
    groups: [{ keys: 'g', label: 'Go to' }],
    dialogRoot: options.dialogRoot,
  });
}

// Reka closes the page on any Escape it sees; a pending key sequence or a focused field claims it first.
export function keepPageOpenOnEscape(event: KeyboardEvent, dialogRoot: HTMLElement | null) {
  if (keyState.pending.length || keyState.count !== null) {
    event.preventDefault();
    resetPending();
  } else if (isTyping(event.target) && dialogRoot) {
    event.preventDefault();
    dialogRoot.focus();
  }
}
