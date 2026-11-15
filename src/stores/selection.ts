import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

/**
 * Selected torrent hashes. The Set is replaced, never mutated, so a single
 * shallowRef trigger covers every change without making 10k strings reactive.
 */
export const useSelectionStore = defineStore('selection', () => {
  const selected = shallowRef<ReadonlySet<string>>(new Set());
  /** Anchor for shift-click ranges. */
  const anchor = ref<string | null>(null);
  /** Keyboard cursor; also the row the detail drawer follows. */
  const focused = ref<string | null>(null);
  /** The selected row the drawer shows while stepping through a multi-selection; never moves `focused`. */
  const viewing = ref<string | null>(null);

  const size = computed(() => selected.value.size);
  const detailsHash = computed(() => {
    if (viewing.value && selected.value.has(viewing.value)) return viewing.value;
    if (focused.value) return focused.value;
    return selected.value.size === 1 ? [...selected.value][0]! : null;
  });
  const hashes = computed(() => [...selected.value]);

  function has(hash: string) {
    return selected.value.has(hash);
  }

  function set(next: Iterable<string>) {
    selected.value = new Set(next);
    viewing.value = null;
  }

  /** The selected rows in `order` (the visible, sorted list). */
  function selectedIn(order: readonly { hash: string }[]) {
    return order.filter((t) => selected.value.has(t.hash));
  }

  /** Steps the drawer through the selection in `order`, wrapping at either end. */
  function viewStep(step: 1 | -1, order: readonly { hash: string }[]) {
    const members = selectedIn(order);
    if (members.length < 2) return;
    const current = members.findIndex((t) => t.hash === detailsHash.value);
    const from = current < 0 && step > 0 ? -1 : Math.max(current, 0);
    viewing.value = members[(from + step + members.length) % members.length]!.hash;
  }

  /** Plain click: select only this row. */
  function selectOnly(hash: string) {
    set([hash]);
    anchor.value = hash;
    focused.value = hash;
  }

  /** Ctrl/cmd-click. */
  function toggle(hash: string) {
    const next = new Set(selected.value);
    if (!next.delete(hash)) next.add(hash);
    set(next);
    anchor.value = hash;
    focused.value = hash;
  }

  /**
   * Shift-click: select the range between the anchor and `hash` in `order`
   * (the visible, sorted list). `additive` (ctrl+shift) keeps the existing selection.
   */
  function selectRange(hash: string, order: readonly { hash: string }[], additive = false) {
    const from = anchor.value ? order.findIndex((t) => t.hash === anchor.value) : -1;
    const to = order.findIndex((t) => t.hash === hash);
    if (to === -1) return;
    if (from === -1) return selectOnly(hash);
    const [lo, hi] = from < to ? [from, to] : [to, from];
    const next = new Set(additive ? selected.value : []);
    for (let i = lo; i <= hi; i++) next.add(order[i]!.hash);
    set(next);
    focused.value = hash;
  }

  function moveCursor(hash: string) {
    focused.value = hash;
    viewing.value = null;
  }

  function selectAll(order: readonly { hash: string }[]) {
    set(order.map((t) => t.hash));
  }

  function invert(order: readonly { hash: string }[]) {
    set(order.filter((t) => !selected.value.has(t.hash)).map((t) => t.hash));
    focused.value = null;
    anchor.value = null;
  }

  function clear() {
    if (selected.value.size) set([]);
    anchor.value = null;
  }

  /** Drops hashes that no longer exist (removed torrents). Cost is O(removed). */
  function remove(removed: readonly string[]) {
    if (!removed.some((h) => selected.value.has(h) || h === focused.value)) return;
    const next = new Set(selected.value);
    for (const h of removed) next.delete(h);
    selected.value = next;
    if (focused.value && removed.includes(focused.value)) focused.value = null;
    if (anchor.value && removed.includes(anchor.value)) anchor.value = null;
  }

  /** Keeps only hashes for which `isVisible` holds (after a filter change). */
  function prune(isVisible: (hash: string) => boolean) {
    const kept = [...selected.value].filter(isVisible);
    if (kept.length !== selected.value.size) selected.value = new Set(kept);
    if (focused.value && !isVisible(focused.value)) focused.value = null;
    if (anchor.value && !isVisible(anchor.value)) anchor.value = null;
  }

  return {
    selected,
    anchor,
    focused,
    viewing,
    size,
    detailsHash,
    hashes,
    has,
    selectOnly,
    toggle,
    selectRange,
    moveCursor,
    selectAll,
    invert,
    selectedIn,
    viewStep,
    clear,
    remove,
    prune,
  };
});
