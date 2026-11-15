<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { Dialog } from '@/components/ui/dialog';
import { formatBytes, formatRatio } from '@/lib/format';
import { TRACKERLESS, only } from '@/lib/torrentFilters';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { closeManage } from './manageState';
import {
  DEFAULT_TRACKER_SORT,
  TRACKER_COLUMNS,
  breakdownByTracker,
  nextTrackerSort,
  sortTrackerTotals,
  type TrackerSort,
  type TrackerSortId,
} from './trackerBreakdown';

const torrents = useTorrentsStore();
const ui = useUiStore();

const sort = ref<TrackerSort>({ ...DEFAULT_TRACKER_SORT });
const rows = computed(() =>
  sortTrackerTotals(breakdownByTracker(torrents.all, torrents.hostsOf), sort.value),
);

const ariaSort = (id: TrackerSortId) =>
  sort.value.id === id ? (sort.value.desc ? 'descending' : 'ascending') : undefined;

const hostLabel = (host: string) => (host === TRACKERLESS ? 'Trackerless' : host);

function showOnly(host: string) {
  ui.updateFilterGroup('tracker', () => only(host));
  closeManage();
}
</script>

<template>
  <Dialog :open="true" title="Trackers" class="max-w-3xl" @update:open="closeManage">
    <p class="mb-form text-muted-foreground">
      A torrent that announces to several trackers counts toward each of them. Click a tracker to
      show only its torrents.
    </p>
    <table class="w-full whitespace-nowrap">
      <thead class="sticky top-0 z-10 bg-background text-left text-muted-foreground">
        <tr class="h-7 shadow-[inset_0_-1px_0_var(--border)]">
          <th
            v-for="column in TRACKER_COLUMNS"
            :key="column.id"
            class="p-0 font-normal"
            :aria-sort="ariaSort(column.id)"
          >
            <button
              type="button"
              class="flex h-7 w-full items-center gap-1 px-2 hover:text-foreground"
              :class="[
                column.isNumeric && 'justify-end',
                sort.id === column.id && 'text-foreground',
              ]"
              @click="sort = nextTrackerSort(sort, column)"
            >
              {{ column.label }}
              <template v-if="sort.id === column.id">
                <ArrowDown v-if="sort.desc" class="size-3" />
                <ArrowUp v-else class="size-3" />
              </template>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.host"
          class="h-7 border-b border-divider hover:bg-row-hover [&>td]:px-2"
        >
          <td class="max-w-72 truncate">
            <button
              v-tooltip="hostLabel(row.host)"
              type="button"
              class="max-w-full truncate text-left hover:underline"
              :class="row.host === TRACKERLESS && 'text-muted-foreground italic'"
              @click="showOnly(row.host)"
            >
              {{ hostLabel(row.host) }}
            </button>
          </td>
          <td class="text-right tabular-nums">{{ row.torrents.toLocaleString() }}</td>
          <td class="text-right tabular-nums">{{ formatBytes(row.size) }}</td>
          <td class="text-right tabular-nums">{{ formatBytes(row.downloaded) }}</td>
          <td class="text-right tabular-nums">{{ formatBytes(row.uploaded) }}</td>
          <td class="text-right tabular-nums">{{ formatRatio(row.ratio) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="py-3 text-muted-foreground">No torrents.</p>
  </Dialog>
</template>
