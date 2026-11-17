<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, watch, watchEffect } from 'vue';
import { useElementSize, useIntervalFn } from '@vueuse/core';
import { useTable, type Updater } from '@tanstack/vue-table';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown, ArrowUp, Check, Gauge, Zap } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore, type TableView } from '@/stores/ui';
import { useSelectionStore } from '@/stores/selection';
import { formatPercent, formatRatio, formatRelativeTime } from '@/lib/format';
import type { SortEntry } from '@/lib/sortTorrents';
import type { Torrent } from '@/types/app';
import {
  MIN_COLUMN_WIDTH,
  reorderColumns,
  tableFeaturesConfig,
  torrentColumns,
  type TorrentColumnMeta,
} from './columns';
import {
  isForced,
  queuePosition,
  stateLabel,
  stateTone,
  statusDisplay,
  statusIconClass,
  STATUS_TONE_TEXT,
} from './state';
import {
  inlineTags,
  labelChipStyle,
  nameClass,
  PROGRESS_BAR_TONE,
  speedLimitHint,
  speedText,
} from './cellStyles';
import { ratioClass } from '@/lib/ratioColors';
import { startTagsMarquee, stopTagsMarquee } from './tagsMarquee';
import { useColumnResize } from './useColumnResize';
import { useColumnVisibility } from './useColumnVisibility';
import { rowsInView } from './tableViewport';
import TorrentSummary from './TorrentSummary.vue';
import { TORRENT_TABLE_ID } from '@/lib/keyboardTargets';

const ROW_HEIGHT: Record<TableView, number> = { stacked: 56, comfortable: 40, compact: 24 };
const CHECKBOX_COLUMN_WIDTH = 32;
const AUTO_NAME_MIN_WIDTH = 240;
// Not text/plain: useWindowDrop treats text drags as magnet links and would hijack the drop.
const COLUMN_DRAG_MIME = 'application/x-slake-column';
const RELATIVE_TIME_REFRESH_MS = 30_000;

const torrents = useTorrentsStore();
const ui = useUiStore();
const selection = useSelectionStore();
const nowMs = ref(Date.now());
useIntervalFn(() => (nowMs.value = Date.now()), RELATIVE_TIME_REFRESH_MS);

function apply<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(prev) : updater;
}

const scrollEl = ref<HTMLElement | null>(null);
const { width: viewportWidth, height: viewportHeight } = useElementSize(scrollEl);

const columnPrefs = useColumnVisibility();
const { tableVisibility, tagsBesideName, resetLayout: resetColumns } = columnPrefs;
const checkboxColumnWidth = computed(() => (ui.multiSelect ? CHECKBOX_COLUMN_WIDTH : 0));

const autoNameWidth = computed(() => {
  let fixedWidth = checkboxColumnWidth.value;
  for (const column of torrentColumns) {
    if (column.id === 'name' || tableVisibility.value[column.id!] === false) continue;
    fixedWidth += ui.columnSizing[column.id!] ?? column.size!;
  }
  return Math.max(AUTO_NAME_MIN_WIDTH, Math.floor(viewportWidth.value - fixedWidth));
});

const columnSizing = computed(() =>
  ui.columnSizing.name === undefined
    ? { ...ui.columnSizing, name: autoNameWidth.value }
    : ui.columnSizing,
);

// Rows never go through the table: `data` stays an empty, stable array.
const noRows: Torrent[] = [];
const table = useTable({
  features: tableFeaturesConfig,
  columns: torrentColumns,
  data: noRows,
  manualSorting: true,
  enableMultiSort: true,
  enableSortingRemoval: false,
  state: computed(() => ({
    sorting: ui.sorting,
    columnSizing: columnSizing.value,
    columnVisibility: tableVisibility.value,
    columnOrder: ui.columnOrder,
  })),
  onSortingChange: (u) => (ui.sorting = apply(u, ui.sorting) as SortEntry[]),
  onColumnSizingChange: (u) => (ui.columnSizing = apply(u, ui.columnSizing)),
  onColumnVisibilityChange: (u) => (ui.columnVisibility = apply(u, columnPrefs.visibility.value)),
  onColumnOrderChange: (u) => (ui.columnOrder = apply(u, ui.columnOrder)),
});

const isStacked = computed(() => ui.tableView === 'stacked');
const cellPadding = computed(() => (ui.tableView === 'comfortable' ? 'px-3' : 'px-2'));
const rowHeight = computed(() => ROW_HEIGHT[ui.tableView] ?? ROW_HEIGHT.stacked);
watchEffect(() => {
  if (viewportHeight.value)
    rowsInView.value = Math.max(1, Math.floor(viewportHeight.value / rowHeight.value));
});

const headers = computed(() => table.getHeaderGroups()[0]?.headers ?? []);
const lastHeaderId = computed(() => headers.value.at(-1)?.id);
const hideableColumns = computed(() => table.getAllLeafColumns().filter((c) => c.getCanHide()));
const metaOf = (columnId: string) =>
  (table.getColumn(columnId)?.columnDef.meta ?? { kind: 'text' }) as TorrentColumnMeta;

interface VisibleColumn {
  id: string;
  meta: TorrentColumnMeta;
  style: string;
}
const columns = computed<VisibleColumn[]>(() =>
  table.getVisibleLeafColumns().map((c) => ({
    id: c.id,
    meta: (c.columnDef.meta ?? { kind: 'text' }) as TorrentColumnMeta,
    style: columnStyle(c.id),
  })),
);

function columnStyle(id: string) {
  return `width:var(--col-${id})`;
}

const tableWidth = computed(() => table.getTotalSize() + checkboxColumnWidth.value);

// Widths live in CSS variables so a resize doesn't re-render every row.
const sizeVars = computed(() => {
  const vars: Record<string, string> = { '--table-width': `${tableWidth.value}px` };
  for (const c of table.getVisibleLeafColumns()) vars[`--col-${c.id}`] = `${c.getSize()}px`;
  return vars;
});

// Anything new a row renders must be part of this key, or v-memo keeps stale rows.
const rowLayoutKey = computed(() =>
  [
    columns.value.map((c) => c.id).join(),
    ui.tableView,
    tagsBesideName.value,
    ui.multiSelect,
    ui.speedUnit,
    ui.sizeUnit,
    ui.dateFormat,
    ui.ratioColors,
    ui.hideInfiniteEta,
  ].join('|'),
);

const columnResize = useColumnResize({
  container: scrollEl,
  widthOf: (id) => table.getColumn(id)?.getSize() ?? MIN_COLUMN_WIDTH,
  minWidthOf: (id) => table.getColumn(id)?.columnDef.minSize ?? MIN_COLUMN_WIDTH,
  tableWidth: () => tableWidth.value,
  commit: (id, width) => {
    ui.columnSizing = {
      ...ui.columnSizing,
      name: ui.columnSizing.name ?? autoNameWidth.value,
      [id]: width,
    };
  },
});

const rows = computed(() => torrents.filteredSorted);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => rowHeight.value,
    getItemKey: (i: number) => rows.value[i]!.hash,
    overscan: 12,
    // Lets the first render fill the screen before the scroll element is measured.
    initialRect: { width: 1200, height: 900 },
  })),
);
watch(rowHeight, () => virtualizer.value.measure());
/** Only the rows in view (plus overscan): a few dozen small objects per update. */
const visibleRows = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((v) => v.index < rows.value.length)
    .map((v) => ({ t: rows.value[v.index]!, index: v.index, start: v.start })),
);
const totalHeight = computed(() => virtualizer.value.getTotalSize());

const allRowsChecked = computed<boolean | 'indeterminate'>(() => {
  if (!selection.size || !rows.value.length) return false;
  return selection.size >= rows.value.length ? true : 'indeterminate';
});

function toggleAllRows() {
  if (allRowsChecked.value === true) selection.clear();
  else selection.selectAll(rows.value);
}

const draggedColumnId = ref<string | null>(null);
const dropTarget = ref<{ id: string; side: 'before' | 'after' } | null>(null);

function onHeaderDragStart(event: DragEvent, columnId: string) {
  if (columnResize.resizingColumnId.value) {
    event.preventDefault();
    return;
  }
  draggedColumnId.value = columnId;
  event.dataTransfer?.setData(COLUMN_DRAG_MIME, columnId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onHeaderDragOver(event: DragEvent, columnId: string) {
  if (!draggedColumnId.value) return;
  event.preventDefault();
  if (columnId === draggedColumnId.value) {
    dropTarget.value = null;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  dropTarget.value = { id: columnId, side };
}

function onHeaderDrop(event: DragEvent) {
  event.preventDefault();
  const moved = draggedColumnId.value;
  const target = dropTarget.value;
  if (moved && target)
    ui.columnOrder = reorderColumns(ui.columnOrder, moved, target.id, target.side);
  onHeaderDragEnd();
}

function onHeaderDragEnd() {
  draggedColumnId.value = null;
  dropTarget.value = null;
}

function ariaSort(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return undefined;
}

function rowHash(event: Event): string | null {
  return (event.target as HTMLElement).closest<HTMLElement>('[data-hash]')?.dataset.hash ?? null;
}

function isOnRowCheckbox(event: Event) {
  return !!(event.target as HTMLElement).closest('[data-row-checkbox]');
}

function onRowClick(event: MouseEvent) {
  const hash = rowHash(event);
  if (!hash) return;
  const additive = ui.multiSelect || isOnRowCheckbox(event) || event.ctrlKey || event.metaKey;
  if (event.shiftKey) selection.selectRange(hash, rows.value, additive);
  else if (additive) selection.toggle(hash);
  else if (isSoleSelection(hash) && !isSecondClickOfDoubleClick(event)) selection.clear();
  else selection.selectOnly(hash);
}

function isSoleSelection(hash: string) {
  return selection.size === 1 && selection.has(hash);
}

function isSecondClickOfDoubleClick(event: MouseEvent) {
  return event.detail > 1;
}

function onEmptySpaceClick(event: MouseEvent) {
  const isOnRowOrControl = !!(event.target as HTMLElement).closest('[role=row], button');
  const hasModifier = event.shiftKey || event.ctrlKey || event.metaKey;
  if (!isOnRowOrControl && !hasModifier) selection.clear();
}

function addOrSelectOnly(hash: string) {
  if (selection.has(hash)) return;
  if (ui.multiSelect) selection.toggle(hash);
  else selection.selectOnly(hash);
}

// In multi-select mode the two clicks of a double-click toggle the row off and back on.
function onRowDoubleClick(event: MouseEvent) {
  const hash = rowHash(event);
  if (!hash || isOnRowCheckbox(event)) return;
  addOrSelectOnly(hash);
  ui.showDetails();
}

/** Right-click on an unselected row selects it before the menu opens. */
function onRowContextMenu(event: MouseEvent) {
  const hash = rowHash(event);
  if (hash) addOrSelectOnly(hash);
}

// Keep the focused or viewed row in view when it moves (keyboard navigation, selection changes).
watch(
  () => selection.detailsHash,
  (hash) => {
    if (!hash) return;
    const index = rows.value.findIndex((t) => t.hash === hash);
    if (index >= 0) virtualizer.value.scrollToIndex(index, { align: 'auto' });
  },
);

function isViewedInMultiSelection(hash: string) {
  return selection.size > 1 && selection.detailsHash === hash;
}

const viewedRowOffset = computed(() => {
  if (!selection.detailsHash || !selection.has(selection.detailsHash)) return null;
  const index = rows.value.findIndex((t) => t.hash === selection.detailsHash);
  return index < 0 ? null : index * rowHeight.value;
});

function isUnselectedCursor(hash: string) {
  return selection.focused === hash && !selection.has(hash);
}

function rowClass(t: Torrent, index: number) {
  if (isViewedInMultiSelection(t.hash)) return 'bg-selected-strong';
  if (selection.has(t.hash)) return 'bg-selected';
  if (t.isErrored) return 'bg-destructive/6 hover:bg-destructive/10';
  return index % 2 ? 'bg-muted/35 hover:bg-row-hover' : 'hover:bg-row-hover';
}

function swarmCounts(t: Torrent, columnId: string) {
  return columnId === 'numSeeds'
    ? { connected: t.numSeeds, total: t.numComplete }
    : { connected: t.numLeechs, total: t.numIncomplete };
}

function speedLimitOf(t: Torrent, columnId: string) {
  return columnId === 'dlspeed'
    ? speedLimitHint(t.dlLimit, 'Download')
    : speedLimitHint(t.upLimit, 'Upload');
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      :id="TORRENT_TABLE_ID"
      ref="scrollEl"
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none"
      :class="ui.tableView === 'compact' && 'text-compact'"
      :style="sizeVars"
      role="table"
      aria-label="Torrents"
      :aria-rowcount="rows.length"
      :aria-multiselectable="true"
      tabindex="0"
      @click="onEmptySpaceClick"
    >
      <div :style="{ width: isStacked ? '100%' : 'var(--table-width)', minWidth: '100%' }">
        <ContextMenu v-if="!isStacked">
          <!-- Right-click the header to pick columns. .stop keeps the torrent menu closed. -->
          <ContextMenuTrigger as-child @contextmenu.stop>
            <div
              role="row"
              class="sticky top-0 z-10 flex border-b bg-table-header text-xs text-muted-foreground select-none"
              :class="ui.tableView === 'comfortable' ? 'h-9' : 'h-7'"
            >
              <div
                v-if="ui.multiSelect"
                class="flex shrink-0 items-center justify-center"
                :style="{ width: `${CHECKBOX_COLUMN_WIDTH}px` }"
              >
                <Checkbox
                  :model-value="allRowsChecked"
                  aria-label="Select all"
                  @update:model-value="toggleAllRows"
                />
              </div>
              <div
                v-for="header in headers"
                :key="header.id"
                role="columnheader"
                :data-col="header.id"
                :aria-sort="ariaSort(header.column.getIsSorted())"
                draggable="true"
                class="relative flex shrink-0 cursor-default items-center gap-1 hover:text-foreground"
                :class="[
                  cellPadding,
                  metaOf(header.id).align && 'justify-end',
                  header.column.getIsSorted() && 'text-foreground',
                  draggedColumnId === header.id && 'opacity-50',
                  dropTarget?.id === header.id &&
                    (dropTarget.side === 'before'
                      ? 'shadow-[inset_2px_0_0_var(--primary)]'
                      : 'shadow-[inset_-2px_0_0_var(--primary)]'),
                ]"
                :style="columnStyle(header.id)"
                @click="header.column.getToggleSortingHandler()?.($event)"
                @dragstart="onHeaderDragStart($event, header.id)"
                @dragover="onHeaderDragOver($event, header.id)"
                @drop="onHeaderDrop"
                @dragend="onHeaderDragEnd"
              >
                <span class="truncate">{{ header.column.columnDef.header }}</span>
                <ArrowDown v-if="header.column.getIsSorted() === 'desc'" class="size-3 shrink-0" />
                <ArrowUp
                  v-else-if="header.column.getIsSorted() === 'asc'"
                  class="size-3 shrink-0"
                />
                <div
                  v-tooltip="'Drag to resize, double-click to fit'"
                  data-resize-handle="true"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="`Resize ${header.column.columnDef.header}`"
                  class="group/handle absolute inset-y-0 z-20 flex w-3 cursor-col-resize touch-none justify-center"
                  :class="header.id === lastHeaderId ? 'right-0' : '-right-1.5'"
                  @pointerdown="columnResize.startResize($event, header.id)"
                  @dblclick.stop="columnResize.autoFit(header.id)"
                  @click.stop
                >
                  <div
                    v-if="header.id !== lastHeaderId"
                    class="my-1.5 w-px bg-border transition-colors group-hover/handle:bg-primary"
                    :class="columnResize.resizingColumnId.value === header.id && 'bg-primary!'"
                  />
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem
              v-for="column in hideableColumns"
              :key="column.id"
              :model-value="columnPrefs.isVisible(column.id)"
              @select.prevent="columnPrefs.toggle(column.id)"
            >
              {{ column.columnDef.header }}
            </ContextMenuCheckboxItem>
            <ContextMenuSeparator />
            <ContextMenuItem @select="resetColumns">Reset columns</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <div
          class="relative select-none"
          :style="{ height: `${totalHeight}px` }"
          @click="onRowClick"
          @dblclick="onRowDoubleClick"
          @contextmenu="onRowContextMenu"
        >
          <div
            v-for="{ t, index, start } in visibleRows"
            :key="t.hash"
            v-memo="[
              t,
              t.rev,
              start,
              rowLayoutKey,
              nowMs,
              selection.has(t.hash),
              isViewedInMultiSelection(t.hash),
              selection.focused === t.hash,
            ]"
            role="row"
            :data-hash="t.hash"
            :aria-rowindex="index + (isStacked ? 1 : 2)"
            :aria-selected="selection.has(t.hash)"
            class="absolute top-0 left-0 flex w-full border-b border-divider transition-colors duration-150 motion-reduce:transition-none"
            :class="[
              rowClass(t, index),
              isStacked && 'items-center pr-3',
              isUnselectedCursor(t.hash) &&
                'outline-1 -outline-offset-1 outline-primary/60 outline-dashed',
            ]"
            :style="{
              height: `${rowHeight}px`,
              transform: `translateY(${start}px)`,
              paddingLeft: isStacked && !ui.multiSelect ? '0.75rem' : undefined,
            }"
          >
            <div
              v-if="ui.multiSelect"
              data-row-checkbox
              role="cell"
              class="flex h-full shrink-0 cursor-pointer items-center justify-center"
              :style="{ width: `${CHECKBOX_COLUMN_WIDTH}px` }"
            >
              <span
                role="checkbox"
                :aria-checked="selection.has(t.hash)"
                :aria-label="`Select ${t.name}`"
                class="flex size-4 items-center justify-center rounded-sm border"
                :class="
                  selection.has(t.hash)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input'
                "
              >
                <Check v-if="selection.has(t.hash)" class="size-3" />
              </span>
            </div>
            <TorrentSummary
              v-if="isStacked"
              role="cell"
              :torrent="t"
              :rev="t.rev"
              :now-ms="nowMs"
              :show-tags="tagsBesideName"
              layout="wide"
            />
            <template v-else>
              <div
                v-for="col in columns"
                :key="col.id"
                role="cell"
                :data-col="col.id"
                class="flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap"
                :class="[
                  cellPadding,
                  col.meta.align && 'justify-end font-mono text-xs tabular-nums',
                ]"
                :style="col.style"
              >
                <template v-if="col.meta.kind === 'name'">
                  <component
                    :is="statusDisplay(t).icon"
                    class="size-3.5 shrink-0"
                    :class="statusIconClass(statusDisplay(t))"
                    aria-hidden="true"
                  />
                  <span
                    v-tooltip="t.error ? `${t.name}\n${t.error}` : t.name"
                    class="min-w-8 truncate"
                    :class="nameClass(t)"
                  >
                    {{ t.name }}
                  </span>
                  <span
                    v-if="tagsBesideName && t.tags.length"
                    v-tooltip="inlineTags(t.tags).hiddenCount > 0 && t.tags.join(', ')"
                    class="flex shrink-0 items-center gap-1"
                  >
                    <span
                      v-for="tag in inlineTags(t.tags).shown"
                      :key="tag"
                      class="label-chip rounded-sm px-1.5 text-xs leading-4.5"
                      :style="labelChipStyle(tag)"
                    >
                      {{ tag }}
                    </span>
                    <span
                      v-if="inlineTags(t.tags).hiddenCount"
                      class="text-xs text-muted-foreground"
                    >
                      +{{ inlineTags(t.tags).hiddenCount }}
                    </span>
                  </span>
                </template>
                <template v-else-if="col.meta.kind === 'progress'">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full"
                      :class="PROGRESS_BAR_TONE[stateTone(t)]"
                      :style="{ width: `${t.progress * 100}%` }"
                    />
                  </div>
                  <span class="w-10 text-right" :class="t.isComplete && 'text-muted-foreground'">
                    {{ formatPercent(t.progress) }}
                  </span>
                </template>
                <span
                  v-else-if="col.meta.kind === 'status'"
                  class="flex min-w-0 items-center gap-1 text-xs"
                  :class="STATUS_TONE_TEXT[statusDisplay(t).tone]"
                >
                  <span class="truncate">{{ stateLabel(t) }}</span>
                  <span v-if="queuePosition(t)" class="text-muted-foreground tabular-nums">
                    #{{ queuePosition(t) }}
                  </span>
                  <Zap v-if="isForced(t)" class="size-3 shrink-0" aria-label="Forced" />
                </span>
                <template v-else-if="col.meta.kind === 'speed'">
                  <Gauge
                    v-if="speedLimitOf(t, col.id)"
                    v-tooltip="speedLimitOf(t, col.id)"
                    data-speed-limited
                    class="size-3 shrink-0 text-muted-foreground"
                  />
                  <span
                    class="truncate"
                    :class="col.id === 'dlspeed' ? 'text-chart-download' : 'text-chart-upload'"
                  >
                    {{
                      col.id === 'dlspeed'
                        ? speedText(t.dlspeed, t.dlLimit)
                        : speedText(t.upspeed, t.upLimit)
                    }}
                  </span>
                </template>
                <span v-else-if="col.meta.kind === 'ratio'" :class="ratioClass(t.ratio)">
                  {{ formatRatio(t.ratio) }}
                </span>
                <span v-else-if="col.meta.kind === 'swarm'" class="truncate">
                  <span :class="!swarmCounts(t, col.id).connected && 'text-muted-foreground'">
                    {{ swarmCounts(t, col.id).connected }}
                  </span>
                  <span class="text-muted-foreground">/{{ swarmCounts(t, col.id).total }}</span>
                </span>
                <span
                  v-else-if="col.meta.kind === 'category'"
                  v-show="t.category"
                  v-tooltip="t.category"
                  class="label-chip truncate rounded-sm px-1.5 text-xs leading-4.5"
                  :style="labelChipStyle(t.category)"
                >
                  {{ t.category }}
                </span>
                <span
                  v-else-if="col.meta.kind === 'tags'"
                  v-show="t.tags.length"
                  v-tooltip="t.tags.join('\n')"
                  class="tags-marquee flex min-w-0 items-center overflow-hidden"
                  @pointerenter="startTagsMarquee"
                  @pointerleave="stopTagsMarquee"
                >
                  <span class="tags-marquee-track flex shrink-0 items-center gap-1">
                    <span
                      v-for="tag in t.tags"
                      :key="tag"
                      class="label-chip shrink-0 rounded-sm px-1.5 text-xs leading-4.5"
                      :style="labelChipStyle(tag)"
                    >
                      {{ tag }}
                    </span>
                  </span>
                </span>
                <span
                  v-else-if="col.meta.kind === 'relativeDate'"
                  v-tooltip="col.meta.title?.(t)"
                  class="truncate"
                >
                  {{ formatRelativeTime(t[col.id as 'addedOn'], nowMs) }}
                </span>
                <span v-else v-tooltip="col.meta.title?.(t)" class="truncate">
                  {{ col.meta.text?.(t) }}
                </span>
              </div>
            </template>
          </div>
          <div
            v-show="viewedRowOffset !== null"
            aria-hidden="true"
            class="pointer-events-none absolute top-0 left-0 w-0.5 transition-transform duration-150 ease-out motion-reduce:transition-none"
            :class="selection.size > 1 ? 'bg-primary' : 'bg-primary/45'"
            :style="{
              height: `${rowHeight}px`,
              transform: `translateY(${viewedRowOffset ?? 0}px)`,
            }"
          />
        </div>
      </div>
      <div
        v-if="!rows.length && torrents.connection !== 'connecting'"
        class="absolute inset-x-0 top-16 flex flex-col items-center gap-2 text-sm text-muted-foreground"
      >
        <template v-if="torrents.all.length">
          No torrents match the current filters.
          <Button variant="outline" size="sm" @click="ui.clearFilters()">Clear filters</Button>
        </template>
        <template v-else>No torrents yet.</template>
      </div>
    </div>
  </div>
</template>
