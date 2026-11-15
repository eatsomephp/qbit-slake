import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useSelectionStore } from './selection';
import { useTorrentsStore } from './torrents';

const order = ['a', 'b', 'c', 'd', 'e'].map((hash) => ({ hash }));
const sel = () => [...useSelectionStore().selected].sort();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('selection store', () => {
  it('selectOnly replaces the selection and sets anchor and focus', () => {
    const s = useSelectionStore();
    s.selectOnly('a');
    s.selectOnly('c');
    expect(sel()).toEqual(['c']);
    expect(s.anchor).toBe('c');
    expect(s.focused).toBe('c');
  });

  it('toggle adds and removes', () => {
    const s = useSelectionStore();
    s.toggle('a');
    s.toggle('b');
    s.toggle('a');
    expect(sel()).toEqual(['b']);
  });

  it('selectRange covers anchor..target in either direction', () => {
    const s = useSelectionStore();
    s.selectOnly('d');
    s.selectRange('b', order);
    expect(sel()).toEqual(['b', 'c', 'd']);
    s.selectRange('e', order); // anchor stays at d
    expect(sel()).toEqual(['d', 'e']);
  });

  it('additive range keeps the existing selection', () => {
    const s = useSelectionStore();
    s.selectOnly('a');
    s.toggle('d');
    s.selectRange('e', order, true);
    expect(sel()).toEqual(['a', 'd', 'e']);
  });

  it('range without an anchor behaves like a plain click', () => {
    const s = useSelectionStore();
    s.selectRange('c', order);
    expect(sel()).toEqual(['c']);
  });

  it('selectAll and clear', () => {
    const s = useSelectionStore();
    s.selectAll(order);
    expect(s.size).toBe(5);
    s.clear();
    expect(s.size).toBe(0);
  });

  it('replaces the Set on every change (one shallow trigger)', () => {
    const s = useSelectionStore();
    const before = s.selected;
    s.toggle('a');
    expect(s.selected).not.toBe(before);
  });

  it('prune keeps only visible hashes and drops a hidden focus', () => {
    const s = useSelectionStore();
    s.selectAll(order);
    s.focused = 'e';
    s.prune((h) => h !== 'b' && h !== 'e');
    expect(sel()).toEqual(['a', 'c', 'd']);
    expect(s.focused).toBeNull();
  });

  it('viewStep cycles the details through the selection in order without moving focus', () => {
    const s = useSelectionStore();
    s.selectOnly('b');
    s.selectRange('d', order);
    expect(s.detailsHash).toBe('d');
    s.viewStep(1, order);
    expect(s.detailsHash).toBe('b'); // wraps
    s.viewStep(-1, order);
    expect(s.detailsHash).toBe('d');
    s.viewStep(-1, order);
    expect(s.detailsHash).toBe('c');
    expect(s.focused).toBe('d');
    expect(sel()).toEqual(['b', 'c', 'd']);
  });

  it('viewStep does nothing for a single selection; selection changes reset the view', () => {
    const s = useSelectionStore();
    s.selectOnly('a');
    s.viewStep(1, order);
    expect(s.viewing).toBeNull();
    s.toggle('c');
    s.viewStep(1, order);
    expect(s.detailsHash).toBe('a');
    s.toggle('e');
    expect(s.detailsHash).toBe('e');
  });

  it('a pruned view falls back to the focused row', () => {
    const s = useSelectionStore();
    s.selectAll(order);
    s.focused = 'a';
    s.viewStep(1, order);
    s.viewStep(1, order);
    expect(s.detailsHash).toBe('c');
    s.prune((h) => h !== 'b');
    expect(s.detailsHash).toBe('c');
    s.prune((h) => h !== 'c');
    expect(s.detailsHash).toBe('a');
  });
});

describe('selection pruning on sync', () => {
  it('removes deleted torrents from the selection in the same poll', () => {
    const torrents = useTorrentsStore();
    const s = useSelectionStore();
    torrents.apply({
      rid: 1,
      full_update: true,
      torrents: { a: { ...DEFAULT_RAW_TORRENT }, b: { ...DEFAULT_RAW_TORRENT } },
    });
    s.selectAll([{ hash: 'a' }, { hash: 'b' }]);
    s.focused = 'a';
    torrents.apply({ rid: 2, torrents_removed: ['a'] });
    expect(sel()).toEqual(['b']);
    expect(s.focused).toBeNull();
  });

  it('a full update that drops torrents prunes them too', () => {
    const torrents = useTorrentsStore();
    const s = useSelectionStore();
    torrents.apply({ rid: 1, full_update: true, torrents: { a: {}, b: {} } });
    s.selectAll([{ hash: 'a' }, { hash: 'b' }]);
    torrents.apply({ rid: 9, full_update: true, torrents: { b: {} } });
    expect(sel()).toEqual(['b']);
  });
});
