import { useKeymap, type Binding, type KeyGroup, type KeymapSection } from './engine';

export interface ListCursor {
  noun: string;
  length: () => number;
  index: () => number;
  moveTo: (index: number) => void;
  rowsPerPage: () => number;
}

export function rowsFitting(element: HTMLElement | null, rowHeight: number) {
  return Math.max(1, Math.floor((element?.clientHeight ?? 0) / rowHeight));
}

export function listMotions(cursor: ListCursor, section: KeymapSection = 'navigate'): Binding[] {
  const hasRows = () => cursor.length() > 0;
  const halfPage = () => Math.max(1, Math.floor(cursor.rowsPerPage() / 2));
  const move =
    (to: (index: number, count: number | null) => number) =>
    ({ count }: { count: number | null }) => {
      const length = cursor.length();
      if (!length) return;
      cursor.moveTo(Math.min(Math.max(to(cursor.index(), count), 0), length - 1));
    };
  const step = (by: (count: number | null) => number) =>
    move((index, count) => (index < 0 ? 0 : index + by(count)));
  const motion = (keys: string, fallbacks: string[], label: string, run: Binding['run']) => ({
    keys,
    fallbacks,
    label,
    section,
    isEnabled: hasRows,
    run,
  });
  return [
    motion(
      'j',
      ['<Down>'],
      `Next ${cursor.noun}`,
      step((count) => count ?? 1),
    ),
    motion(
      'k',
      ['<Up>'],
      `Previous ${cursor.noun}`,
      step((count) => -(count ?? 1)),
    ),
    motion(
      'gg',
      ['<Home>'],
      `First ${cursor.noun} (or row N)`,
      move((_, count) => (count ?? 1) - 1),
    ),
    motion(
      'G',
      ['<End>'],
      `Last ${cursor.noun} (or row N)`,
      move((_, count) => (count === null ? cursor.length() - 1 : count - 1)),
    ),
    motion('<C-d>', ['<PageDown>'], 'Half a page down', step(halfPage)),
    motion(
      '<C-u>',
      ['<PageUp>'],
      'Half a page up',
      step(() => -halfPage()),
    ),
  ];
}

export function scrollMotions(
  scroller: () => HTMLElement | null | undefined,
  lineHeight: number,
  section: KeymapSection = 'navigate',
): Binding[] {
  const scrollBy =
    (lines: (count: number, el: HTMLElement) => number) =>
    ({ count }: { count: number | null }) => {
      const el = scroller();
      el?.scrollBy({ top: lines(count ?? 1, el) * lineHeight });
    };
  const halfPageLines = (el: HTMLElement) =>
    Math.max(1, Math.floor(el.clientHeight / lineHeight / 2));
  const scrollTo = (top: (el: HTMLElement) => number) => () => {
    const el = scroller();
    el?.scrollTo({ top: top(el) });
  };
  return [
    { keys: 'j', fallbacks: ['<Down>'], label: 'Scroll down', section, run: scrollBy((n) => n) },
    { keys: 'k', fallbacks: ['<Up>'], label: 'Scroll up', section, run: scrollBy((n) => -n) },
    {
      keys: 'gg',
      fallbacks: ['<Home>'],
      label: 'Scroll to the top',
      section,
      run: scrollTo(() => 0),
    },
    {
      keys: 'G',
      fallbacks: ['<End>'],
      label: 'Scroll to the bottom',
      section,
      run: scrollTo((el) => el.scrollHeight),
    },
    {
      keys: '<C-d>',
      fallbacks: ['<PageDown>'],
      label: 'Half a page down',
      section,
      run: scrollBy((n, el) => n * halfPageLines(el)),
    },
    {
      keys: '<C-u>',
      fallbacks: ['<PageUp>'],
      label: 'Half a page up',
      section,
      run: scrollBy((n, el) => -n * halfPageLines(el)),
    },
  ];
}

export function hasFocusWithin(element: Element | null | undefined) {
  return !!element && element.contains(document.activeElement);
}

export function useFocusedKeymap(
  element: () => Element | null | undefined,
  bindings: () => readonly Binding[],
  groups: readonly KeyGroup[] = [],
) {
  useKeymap({
    get bindings() {
      return bindings();
    },
    groups,
    isActive: () => hasFocusWithin(element()),
    passesUnboundKeysDown: true,
  });
}
