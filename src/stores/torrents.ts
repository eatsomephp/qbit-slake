import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef, watch } from 'vue';
import { applyMaindata, createSyncState, resetSyncState } from '@/sync/merge';
import type { MergeResult } from '@/sync/merge';
import type { MaindataResponse } from '@/types/qbit';
import type { Torrent } from '@/types/app';
import { seedOrder, sortTorrents } from '@/lib/sortTorrents';
import {
  combineTests,
  compileDimensionTests,
  compileFilter,
  countTorrents,
  emptyFilters,
  indexTrackerHosts,
  type DimensionTest,
  type FilterGroupKey,
} from '@/lib/torrentFilters';
import { freeSearchText } from '@/lib/filterQuery';
import { useSelectionStore } from './selection';
import { useUiStore } from './ui';
import { useTransferStore } from './transfer';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

const NO_HOSTS: readonly string[] = [];
const NO_TESTS: readonly DimensionTest[] = [];

/**
 * The torrent collection is never deep-reactive. The sync state (Maps of plain,
 * markRaw torrents) is mutated in place, and `version` is bumped once per poll:
 * every computed that reads the collection depends on `version` alone.
 */
export const useTorrentsStore = defineStore('torrents', () => {
  const sync = markRaw(createSyncState());
  const version = ref(0);
  const connection = ref<ConnectionState>('connecting');
  const selection = useSelectionStore();
  const ui = useUiStore();
  const transfer = useTransferStore();
  /** Hashes changed by the last poll, for code that wants to update incrementally. */
  let lastResult: MergeResult = {
    changed: new Set(),
    removed: [],
    structural: false,
    trackersChanged: false,
  };
  /** hash → tracker hosts; rebuilt only when maindata's tracker map changes. */
  const trackerIndex = shallowRef(indexTrackerHosts(sync.trackers));

  function apply(data: MaindataResponse): MergeResult {
    lastResult = applyMaindata(sync, data);
    if (lastResult.trackersChanged) trackerIndex.value = indexTrackerHosts(sync.trackers);
    // Deleted torrents must never stay selected, or a bulk action could target them.
    if (lastResult.removed.length) selection.remove(lastResult.removed);
    // A diff carrying only `rid` changed nothing; skip the trigger.
    if (Object.keys(data).length > 1) version.value++;
    const { dl_info_speed, up_info_speed } = sync.serverState;
    transfer.record(dl_info_speed, up_info_speed);
    return lastResult;
  }

  function reset() {
    resetSyncState(sync);
    lastSorted = [];
    trackerIndex.value = indexTrackerHosts(sync.trackers);
    selection.clear();
    selection.focused = null;
    transfer.clear();
    connection.value = 'connecting';
    version.value++;
  }

  /** All torrents, unordered. One array allocation per poll; the torrents themselves are reused. */
  const all = computed<Torrent[]>(() => (version.value, Array.from(sync.torrents.values())));

  function hostsOf(hash: string): readonly string[] {
    return trackerIndex.value.hostsByHash.get(hash) ?? NO_HOSTS;
  }

  /** Current filter predicate, or null when nothing is filtered. */
  const useSubcategories = computed(() => (version.value, sync.serverState.use_subcategories));
  const searchText = computed(() => freeSearchText(ui.search));
  const dimensionTests = computed(() =>
    compileDimensionTests(ui.filters, searchText.value, hostsOf, {
      useSubcategories: useSubcategories.value,
      // Age conditions compare against now, so they must recompile on every poll.
      nowSeconds: ui.filters.conditions.length ? (version.value, Date.now() / 1000) : 0,
    }),
  );
  const matches = computed(() => combineTests(dimensionTests.value));

  let lastSorted: Torrent[] = [];
  const filteredSorted = computed<Torrent[]>(() => {
    const match = matches.value;
    const list = match ? all.value.filter(match) : all.value;
    lastSorted = sortTorrents(seedOrder(list, lastSorted), ui.sorting);
    return lastSorted;
  });

  // Small collections: plain copies are cheap and give computeds a new identity.
  const serverState = computed(() => (version.value, { ...sync.serverState }));
  const categories = computed(() => (version.value, Array.from(sync.categories.values())));
  const tags = computed(() => (version.value, Array.from(sync.tags)));
  const trackerHosts = computed(() => trackerIndex.value.hosts);

  // Returning the shared NO_TESTS keeps "All torrents" mode from recounting on every keystroke.
  const facetTests = computed(() =>
    ui.sidebarCountMode === 'matching' ? dimensionTests.value : NO_TESTS,
  );
  const countResult = computed(() =>
    countTorrents(
      all.value,
      categories.value.map((c) => c.name),
      tags.value,
      trackerIndex.value.hostsByHash,
      trackerIndex.value.hosts,
      facetTests.value,
    ),
  );
  const counts = computed(() => countResult.value.global);
  const sidebarCounts = computed(() => countResult.value.faceted);

  // Bulk actions must never hit torrents you can't see: drop selected hashes that
  // fall out of view, whether the filters changed or the torrent did. O(selection).
  watch(
    [matches, version],
    () => {
      const match = matches.value;
      if (!match || (!selection.size && !selection.focused)) return;
      selection.prune((hash) => {
        const t = sync.torrents.get(hash);
        return t !== undefined && match(t);
      });
    },
    { flush: 'sync' },
  );

  function hashesMatchingOnly(group: FilterGroupKey, value: string): string[] {
    const filters = { ...emptyFilters(), [group]: { include: [value], exclude: [] } };
    const match = compileFilter(filters, '', hostsOf, {
      useSubcategories: useSubcategories.value,
    })!;
    return all.value.filter(match).map((t) => t.hash);
  }

  /** Tracker URL → those of `hashes` that use it. Tracks `version`, so callers stay live. */
  function trackerUrlsOf(hashes: readonly string[]): Map<string, string[]> {
    void version.value;
    const wanted = new Set(hashes);
    const result = new Map<string, string[]>();
    for (const [url, users] of sync.trackers) {
      const matching = users.filter((hash) => wanted.has(hash));
      if (matching.length) result.set(url, matching);
    }
    return result;
  }

  function get(hash: string): Torrent | undefined {
    return sync.torrents.get(hash);
  }

  return {
    version,
    connection,
    all,
    filteredSorted,
    serverState,
    categories,
    tags,
    trackerHosts,
    counts,
    sidebarCounts,
    useSubcategories,
    apply,
    reset,
    get,
    hostsOf,
    hashesMatchingOnly,
    trackerUrlsOf,
    lastChanged: () => lastResult,
  };
});
