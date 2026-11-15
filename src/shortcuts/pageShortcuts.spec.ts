import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { closeManage, manage } from '@/features/manage/manageState';

const push = vi.hoisted(() => vi.fn());
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

const { activeKeymaps, keyState, resetPending, useKeymap } = await import('./engine');
const { cheatSheetBinding, gotoBindings, keepPageOpenOnEscape, openCheatSheet, usePageShortcuts } =
  await import('./pageShortcuts');

const mounted: VueWrapper[] = [];
const press = (k: string, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function mountPage(options: Partial<Parameters<typeof usePageShortcuts>[0]> = {}) {
  const root = document.body.appendChild(document.createElement('div'));
  root.setAttribute('role', 'dialog');
  root.tabIndex = -1;
  const close = vi.fn();
  mounted.push(
    mount(
      defineComponent({
        setup() {
          usePageShortcuts({ dialogRoot: () => root, close, ...options });
          return () => h('i');
        },
      }),
    ),
  );
  return { root, close };
}

beforeEach(() => push.mockReset());
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  resetPending();
  closeManage();
});

describe('gotoBindings', () => {
  it('routes each g-prefixed key to its named page', () => {
    const router = { push: vi.fn() };
    const bindings = gotoBindings(router as never);
    const go = (keys: string) => bindings.find((b) => b.keys === keys)!.run({} as never);
    go('gs');
    go('gr');
    go('ge');
    go('gl');
    go('gc');
    expect(router.push.mock.calls.map(([to]) => to)).toEqual([
      { name: 'settings' },
      { name: 'rss' },
      { name: 'search' },
      { name: 'log' },
      { name: 'creator' },
    ]);
  });
});

describe('usePageShortcuts', () => {
  it('closes with q even though the page dialog is open', () => {
    const { close } = mountPage();
    press('q');
    expect(close).toHaveBeenCalledOnce();
  });

  it('navigates with g-sequences', () => {
    mountPage();
    press('g');
    press('r');
    expect(push).toHaveBeenCalledWith({ name: 'rss' });
  });

  it('only offers tab and search bindings when provided', () => {
    mountPage();
    const keys = activeKeymaps()[0]!.bindings.map((b) => b.keys);
    expect(keys).not.toContain('gt');
    expect(keys).not.toContain('/');
  });

  it('steps tabs with gt and gT and focuses search with /', () => {
    const stepTab = vi.fn();
    const focusSearch = vi.fn();
    mountPage({ stepTab, focusSearch, tabNoun: 'feed' });
    press('g');
    press('t');
    press('g');
    press('T');
    press('/');
    expect(stepTab.mock.calls).toEqual([[1], [-1]]);
    expect(focusSearch).toHaveBeenCalledOnce();
    expect(activeKeymaps()[0]!.bindings.find((b) => b.keys === 'gt')!.label).toBe('Next feed');
  });

  it('leaves / alone while the search box is not shown', () => {
    const focusSearch = vi.fn();
    const isSearchShown = ref(false);
    mountPage({ focusSearch, isSearchShown: () => isSearchShown.value });
    expect(press('/')).toBe(true);
    expect(focusSearch).not.toHaveBeenCalled();
    isSearchShown.value = true;
    press('/');
    expect(focusSearch).toHaveBeenCalledOnce();
  });

  it('shadows the main-table keymap beneath it', () => {
    const table = vi.fn();
    mounted.push(
      mount(
        defineComponent({
          setup() {
            useKeymap({ bindings: [{ keys: 'x', label: 'x', run: table }] });
            return () => h('i');
          },
        }),
      ),
    );
    mountPage();
    press('x');
    expect(table).not.toHaveBeenCalled();
  });

  it('opens the cheat sheet with the current keymap chain on ?', () => {
    mountPage();
    press('?');
    expect(manage.value).toMatchObject({ kind: 'shortcuts' });
    const request = manage.value as unknown as { keymaps: unknown[] };
    expect(request.keymaps).toEqual(activeKeymaps());
  });
});

describe('cheat sheet', () => {
  it('openCheatSheet and cheatSheetBinding share the same action', () => {
    expect(cheatSheetBinding.keys).toBe('?');
    expect(cheatSheetBinding.run).toBe(openCheatSheet);
  });
});

describe('keepPageOpenOnEscape', () => {
  const escape = (target: EventTarget | null) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    keepPageOpenOnEscape(event, root());
    return event;
  };
  let rootEl: HTMLElement;
  const root = () => rootEl;
  beforeEach(() => {
    rootEl = document.body.appendChild(document.createElement('div'));
    rootEl.tabIndex = -1;
  });

  it('consumes Escape to cancel a pending sequence', () => {
    keyState.pending = ['g'];
    const event = escape(document.body);
    expect(event.defaultPrevented).toBe(true);
    expect(keyState.pending).toEqual([]);
  });

  it('consumes Escape to cancel a pending count', () => {
    keyState.count = 4;
    expect(escape(document.body).defaultPrevented).toBe(true);
    expect(keyState.count).toBeNull();
  });

  it('moves focus out of a field to the dialog instead of closing', () => {
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();
    expect(escape(input).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rootEl);
  });

  it('lets Escape through when nothing claims it', () => {
    expect(escape(document.body).defaultPrevented).toBe(false);
  });
});
