import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { resetPending, useKeymap, type Binding } from './engine';
import {
  hasFocusWithin,
  listMotions,
  rowsFitting,
  scrollMotions,
  useFocusedKeymap,
  type ListCursor,
} from './lists';

const context = (count: number | null = null) => ({ count, extend: false, wasVisual: false });
const find = (bindings: Binding[], keys: string) => bindings.find((b) => b.keys === keys)!;

function cursorOf(length: number, index: number, rowsPerPage = 10) {
  const moveTo = vi.fn();
  const cursor: ListCursor = {
    noun: 'file',
    length: () => length,
    index: () => index,
    moveTo,
    rowsPerPage: () => rowsPerPage,
  };
  return { bindings: listMotions(cursor), moveTo };
}

describe('rowsFitting', () => {
  it('floors the fit and never goes below one', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'clientHeight', 'get').mockReturnValue(100);
    expect(rowsFitting(el, 30)).toBe(3);
    expect(rowsFitting(el, 500)).toBe(1);
    expect(rowsFitting(null, 30)).toBe(1);
  });
});

describe('listMotions', () => {
  it('names bindings after the noun and gives each a fallback', () => {
    const { bindings } = cursorOf(3, 0);
    expect(find(bindings, 'j').label).toBe('Next file');
    expect(find(bindings, 'j').fallbacks).toEqual(['<Down>']);
    expect(find(bindings, 'G').fallbacks).toEqual(['<End>']);
  });

  it('steps by count and clamps to the list', () => {
    const { bindings, moveTo } = cursorOf(5, 3);
    find(bindings, 'j').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(4);
    find(bindings, 'j').run(context(10));
    expect(moveTo).toHaveBeenLastCalledWith(4);
    find(bindings, 'k').run(context(2));
    expect(moveTo).toHaveBeenLastCalledWith(1);
    find(bindings, 'k').run(context(50));
    expect(moveTo).toHaveBeenLastCalledWith(0);
  });

  it('starts at the first row when there is no cursor yet', () => {
    const { bindings, moveTo } = cursorOf(5, -1);
    find(bindings, 'j').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(0);
    find(bindings, 'k').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(0);
  });

  it('jumps to the first, last, or Nth row', () => {
    const { bindings, moveTo } = cursorOf(5, 2);
    find(bindings, 'gg').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(0);
    find(bindings, 'gg').run(context(3));
    expect(moveTo).toHaveBeenLastCalledWith(2);
    find(bindings, 'G').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(4);
    find(bindings, 'G').run(context(2));
    expect(moveTo).toHaveBeenLastCalledWith(1);
    find(bindings, 'G').run(context(99));
    expect(moveTo).toHaveBeenLastCalledWith(4);
  });

  it('moves by half a page, at least one row', () => {
    const { bindings, moveTo } = cursorOf(100, 10, 10);
    find(bindings, '<C-d>').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(15);
    find(bindings, '<C-u>').run(context());
    expect(moveTo).toHaveBeenLastCalledWith(5);
    const tiny = cursorOf(100, 10, 1);
    find(tiny.bindings, '<C-d>').run(context());
    expect(tiny.moveTo).toHaveBeenLastCalledWith(11);
  });

  it('does nothing on an empty list and reports itself disabled', () => {
    const { bindings, moveTo } = cursorOf(0, -1);
    find(bindings, 'j').run(context());
    find(bindings, 'G').run(context());
    expect(moveTo).not.toHaveBeenCalled();
    expect(find(bindings, 'j').isEnabled!()).toBe(false);
  });
});

describe('scrollMotions', () => {
  function scroller() {
    const el = document.createElement('div');
    vi.spyOn(el, 'clientHeight', 'get').mockReturnValue(200);
    vi.spyOn(el, 'scrollHeight', 'get').mockReturnValue(1000);
    el.scrollBy = vi.fn();
    el.scrollTo = vi.fn();
    return el;
  }

  it('scrolls by lines times count', () => {
    const el = scroller();
    const bindings = scrollMotions(() => el, 20);
    find(bindings, 'j').run(context(3));
    expect(el.scrollBy).toHaveBeenLastCalledWith({ top: 60 });
    find(bindings, 'k').run(context());
    expect(el.scrollBy).toHaveBeenLastCalledWith({ top: -20 });
  });

  it('scrolls half a page and to the extremes', () => {
    const el = scroller();
    const bindings = scrollMotions(() => el, 20);
    find(bindings, '<C-d>').run(context());
    expect(el.scrollBy).toHaveBeenLastCalledWith({ top: 100 });
    find(bindings, '<C-u>').run(context(2));
    expect(el.scrollBy).toHaveBeenLastCalledWith({ top: -200 });
    find(bindings, 'gg').run(context());
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    find(bindings, 'G').run(context());
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000 });
  });

  it('tolerates a missing scroller', () => {
    const bindings = scrollMotions(() => null, 20);
    expect(() => bindings.forEach((b) => b.run(context()))).not.toThrow();
  });
});

describe('focus-scoped keymaps', () => {
  const mounted: VueWrapper[] = [];
  const host = (setup: () => void) =>
    mounted.push(
      mount(
        defineComponent({
          setup() {
            setup();
            return () => h('i');
          },
        }),
      ),
    );
  const press = (k: string) =>
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    );

  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    document.body.innerHTML = '';
    resetPending();
  });

  it('hasFocusWithin follows document focus', () => {
    const panel = document.body.appendChild(document.createElement('div'));
    panel.tabIndex = 0;
    const outside = document.body.appendChild(document.createElement('button'));
    expect(hasFocusWithin(null)).toBe(false);
    outside.focus();
    expect(hasFocusWithin(panel)).toBe(false);
    panel.focus();
    expect(hasFocusWithin(panel)).toBe(true);
  });

  it('is inert until focus is inside and passes unbound keys to the keymap below', () => {
    const panel = document.body.appendChild(document.createElement('div'));
    panel.tabIndex = 0;
    const outside = document.body.appendChild(document.createElement('button'));
    const scoped = vi.fn();
    const global = vi.fn();
    const globalOnly = vi.fn();
    host(() =>
      useKeymap({
        bindings: [
          { keys: 'x', label: 'x', run: global },
          { keys: 'y', label: 'y', run: globalOnly },
        ],
      }),
    );
    host(() =>
      useFocusedKeymap(
        () => panel,
        () => [{ keys: 'x', label: 'x', run: scoped }],
      ),
    );

    outside.focus();
    press('x');
    expect(scoped).not.toHaveBeenCalled();
    expect(global).toHaveBeenCalledOnce();

    panel.focus();
    press('x');
    press('y');
    expect(scoped).toHaveBeenCalledOnce();
    expect(global).toHaveBeenCalledOnce();
    expect(globalOnly).toHaveBeenCalledOnce();
  });

  it('reads bindings lazily so changes apply without remounting', () => {
    const panel = document.body.appendChild(document.createElement('div'));
    panel.tabIndex = 0;
    panel.focus();
    const run = vi.fn();
    let current: Binding[] = [];
    host(() =>
      useFocusedKeymap(
        () => panel,
        () => current,
      ),
    );
    press('x');
    expect(run).not.toHaveBeenCalled();
    current = [{ keys: 'x', label: 'x', run }];
    press('x');
    expect(run).toHaveBeenCalledOnce();
  });
});
