import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { DETAILS_PANEL_ID } from '@/lib/keyboardTargets';
import { resetPending, useKeymap, type Binding } from '@/shortcuts/engine';
import { scrollRowIntoView, useDetailsKeymap, useDetailsList } from './detailsKeymap';

const mounted: VueWrapper[] = [];

function host<T>(setup: () => T) {
  let result!: T;
  mounted.push(
    mount(
      defineComponent({
        setup() {
          result = setup();
          return () => h('i');
        },
      }),
    ),
  );
  return result;
}

const press = (k: string) =>
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
  );

function addPanel() {
  const panel = document.body.appendChild(document.createElement('div'));
  panel.id = DETAILS_PANEL_ID;
  panel.tabIndex = 0;
  return panel;
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  resetPending();
});

describe('useDetailsKeymap', () => {
  it('is active only while focus is inside the details panel', () => {
    const panel = addPanel();
    const outside = document.body.appendChild(document.createElement('button'));
    const run = vi.fn();
    host(() => useDetailsKeymap(() => [{ keys: 'x', label: 'x', run }]));
    outside.focus();
    press('x');
    expect(run).not.toHaveBeenCalled();
    panel.focus();
    press('x');
    expect(run).toHaveBeenCalledOnce();
  });

  it('lets keys it does not bind reach the table keymap', () => {
    const panel = addPanel();
    panel.focus();
    const table = vi.fn();
    host(() => useKeymap({ bindings: [{ keys: 'q', label: 'q', run: table }] }));
    host(() => useDetailsKeymap(() => []));
    press('q');
    expect(table).toHaveBeenCalledOnce();
  });
});

describe('scrollRowIntoView', () => {
  it('scrolls the child at the index and tolerates missing targets', () => {
    const rows = document.createElement('div');
    const child = rows.appendChild(document.createElement('div'));
    child.scrollIntoView = vi.fn();
    scrollRowIntoView(rows, 0);
    expect(child.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(() => scrollRowIntoView(rows, 5)).not.toThrow();
    expect(() => scrollRowIntoView(null, 0)).not.toThrow();
  });
});

describe('useDetailsList', () => {
  interface Row {
    id: string;
  }

  function setup(initial: Row[], extra: (row: () => Row | undefined) => Binding[] = () => []) {
    const rows = { value: initial };
    const scrollTo = vi.fn();
    const list = host(() =>
      useDetailsList<Row>({
        noun: 'file',
        rows: () => rows.value,
        keyOf: (row) => row.id,
        rowHeight: 20,
        scroller: () => null,
        scrollTo,
        bindings: extra,
      }),
    );
    return { rows, scrollTo, list, panel: addPanel() };
  }

  const ids = (...names: string[]) => names.map((id) => ({ id }));

  it('tracks the cursor by key and exposes the row', () => {
    const { list } = setup(ids('a', 'b', 'c'));
    expect(list.cursorRow()).toBeUndefined();
    list.moveTo(1);
    expect(list.cursorRow()).toEqual({ id: 'b' });
    expect(list.isCursor({ id: 'b' })).toBe(true);
    expect(list.isCursor({ id: 'a' })).toBe(false);
    list.setCursor({ id: 'c' });
    expect(list.cursorRow()).toEqual({ id: 'c' });
  });

  it('keeps the cursor on the same row when the list reorders', () => {
    const { list, rows } = setup(ids('a', 'b', 'c'));
    list.moveTo(2);
    rows.value = ids('c', 'a', 'b');
    expect(list.cursorRow()).toEqual({ id: 'c' });
  });

  it('drops the cursor row when it disappears', () => {
    const { list, rows } = setup(ids('a', 'b'));
    list.moveTo(1);
    rows.value = ids('a');
    expect(list.cursorRow()).toBeUndefined();
  });

  it('j and k move the cursor and scroll it into view from the focused panel', () => {
    const { list, scrollTo, panel } = setup(ids('a', 'b', 'c'));
    panel.focus();
    press('j');
    expect(list.cursorRow()).toEqual({ id: 'a' });
    press('j');
    press('j');
    press('j');
    expect(list.cursorRow()).toEqual({ id: 'c' });
    expect(scrollTo).toHaveBeenLastCalledWith(2);
    press('k');
    expect(list.cursorRow()).toEqual({ id: 'b' });
    press('G');
    expect(list.cursorRow()).toEqual({ id: 'c' });
    press('g');
    press('g');
    expect(list.cursorRow()).toEqual({ id: 'a' });
  });

  it('passes the live cursor row to custom bindings', () => {
    const seen = vi.fn();
    const { list, panel } = setup(ids('a', 'b'), (cursorRow) => [
      { keys: 'x', label: 'x', run: () => seen(cursorRow()) },
    ]);
    panel.focus();
    press('x');
    expect(seen).toHaveBeenLastCalledWith(undefined);
    list.moveTo(1);
    press('x');
    expect(seen).toHaveBeenLastCalledWith({ id: 'b' });
  });
});
