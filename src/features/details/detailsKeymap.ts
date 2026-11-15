import { ref } from 'vue';
import { DETAILS_PANEL_ID } from '@/lib/keyboardTargets';
import type { Binding, KeyGroup } from '@/shortcuts/engine';
import { listMotions, rowsFitting, useFocusedKeymap } from '@/shortcuts/lists';

export function useDetailsKeymap(
  bindings: () => readonly Binding[],
  groups: readonly KeyGroup[] = [],
) {
  useFocusedKeymap(() => document.getElementById(DETAILS_PANEL_ID), bindings, groups);
}

export function scrollRowIntoView(rows: HTMLElement | null | undefined, index: number) {
  rows?.children[index]?.scrollIntoView({ block: 'nearest' });
}

export interface DetailsListOptions<Row> {
  noun: string;
  rows: () => readonly Row[];
  keyOf: (row: Row) => string;
  rowHeight: number;
  scroller: () => HTMLElement | null;
  scrollTo: (index: number) => void;
  bindings: (cursorRow: () => Row | undefined) => Binding[];
  groups?: readonly KeyGroup[];
}

export function useDetailsList<Row>(options: DetailsListOptions<Row>) {
  const { rows, keyOf } = options;
  const cursorKey = ref<string | null>(null);
  const cursorIndex = () =>
    cursorKey.value === null ? -1 : rows().findIndex((row) => keyOf(row) === cursorKey.value);
  const cursorRow = () => {
    const index = cursorIndex();
    return index < 0 ? undefined : rows()[index];
  };

  function moveTo(index: number) {
    cursorKey.value = keyOf(rows()[index]!);
    options.scrollTo(index);
  }

  useDetailsKeymap(
    () => [
      ...listMotions({
        noun: options.noun,
        length: () => rows().length,
        index: cursorIndex,
        moveTo,
        rowsPerPage: () => rowsFitting(options.scroller(), options.rowHeight),
      }),
      ...options.bindings(cursorRow),
    ],
    options.groups,
  );

  return {
    cursorRow,
    moveTo,
    isCursor: (row: Row) => cursorKey.value === keyOf(row),
    setCursor: (row: Row) => (cursorKey.value = keyOf(row)),
  };
}
