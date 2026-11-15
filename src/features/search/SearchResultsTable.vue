<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown, ArrowUp, Copy, Download, ExternalLink, Zap } from '@lucide/vue';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useCopyText } from '@/composables/useCopyText';
import { formatBytes, formatDate, formatRelativeTime } from '@/lib/format';
import { isHttpUrl } from '@/lib/urls';
import qbit from '@/services/qbit';
import { useToastsStore } from '@/stores/toasts';
import { requestSync } from '@/sync/useMaindata';
import type { SearchResult } from '@/types/app';
import { openAdd } from '@/features/add/addState';
import {
  RESULT_COLUMNS,
  nextResultSort,
  type ResultColumn,
  type ResultSort,
} from './searchResults';
import { listMotions, rowsFitting, useFocusedKeymap } from '@/shortcuts/lists';
import { reportSearchFailure } from './useSearchJobs';

const ROW_HEIGHT = 28;

const props = defineProps<{
  results: SearchResult[];
  pluginName: (engine: string) => string;
}>();
const sort = defineModel<ResultSort>('sort', { required: true });

const toasts = useToastsStore();
const copyText = useCopyText();

const selected = shallowRef(new Set<number>());
const anchor = ref<number | null>(null);

watch(
  () => props.results,
  (results) => {
    const present = new Set(results.map((result) => result.index));
    if ([...selected.value].some((index) => !present.has(index)))
      selected.value = new Set([...selected.value].filter((index) => present.has(index)));
  },
);

const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.results.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 800, height: 600 },
  })),
);
const visibleRows = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((row) => row.index < props.results.length)
    .map((row) => ({ result: props.results[row.index]!, position: row.index, start: row.start })),
);

const COLUMN_CLASS: Record<ResultColumn['id'], string> = {
  name: 'flex min-w-0 flex-1',
  size: 'flex w-20 shrink-0 justify-end text-right',
  seeds: 'flex w-16 shrink-0 justify-end text-right',
  leechers: 'hidden w-18 shrink-0 justify-end text-right @xl:flex',
  engine: 'hidden w-36 shrink-0 @3xl:flex',
  published: 'hidden w-24 shrink-0 justify-end text-right @2xl:flex',
};

const ariaSort = (id: string) =>
  sort.value.id === id ? (sort.value.desc ? 'descending' : 'ascending') : undefined;

const engineLabel = (result: SearchResult) =>
  result.engineFullName || props.pluginName(result.engine);
const countOrBlank = (value: number | null) => (value === null ? '' : value.toLocaleString());

function selectOnly(position: number) {
  const result = props.results[position];
  if (!result) return;
  selected.value = new Set([result.index]);
  anchor.value = position;
}

function onRowClick(event: MouseEvent, position: number) {
  const result = props.results[position]!;
  if (event.shiftKey && anchor.value !== null) {
    const [from, to] = [Math.min(anchor.value, position), Math.max(anchor.value, position)];
    selected.value = new Set(props.results.slice(from, to + 1).map((r) => r.index));
    return;
  }
  if (event.metaKey || event.ctrlKey) {
    const next = new Set(selected.value);
    if (!next.delete(result.index)) next.add(result.index);
    selected.value = next;
    anchor.value = position;
    return;
  }
  selectOnly(position);
}

function onRowContextMenu(position: number) {
  if (!selected.value.has(props.results[position]!.index)) selectOnly(position);
}

const selectedResults = () => props.results.filter((result) => selected.value.has(result.index));

function openAddDialog(results = selectedResults()) {
  if (!results.length) return;
  openAdd({
    text: results.map((result) => result.url).join('\n'),
    downloaders: Object.fromEntries(results.map((result) => [result.url, result.engine])),
  });
}

async function downloadNow() {
  const results = selectedResults();
  const outcomes = await Promise.allSettled(
    results.map((result) => qbit.downloadSearchResult(result.url, result.engine)),
  );
  const failure = outcomes.find((outcome) => outcome.status === 'rejected');
  if (failure) reportSearchFailure('Download', failure.reason);
  const sent = outcomes.length - outcomes.filter((o) => o.status === 'rejected').length;
  if (sent)
    toasts.info(sent === 1 ? 'Sent to qBittorrent.' : `${sent} torrents sent to qBittorrent.`);
  setTimeout(requestSync, 1000);
}

function openDescriptions() {
  for (const result of selectedResults())
    if (isHttpUrl(result.descriptionUrl))
      window.open(result.descriptionUrl, '_blank', 'noopener,noreferrer');
}

const selectionHasDescription = () =>
  selectedResults().some((result) => isHttpUrl(result.descriptionUrl));

function copyField(field: 'name' | 'url' | 'descriptionUrl') {
  void copyText(
    selectedResults()
      .map((result) => result[field])
      .join('\n'),
  );
}

function moveCursorTo(position: number) {
  selectOnly(position);
  virtualizer.value.scrollToIndex(position, { align: 'auto' });
}

useFocusedKeymap(
  () => scrollEl.value,
  () => [
    ...listMotions({
      noun: 'result',
      length: () => props.results.length,
      index: () => anchor.value ?? -1,
      moveTo: moveCursorTo,
      rowsPerPage: () => rowsFitting(scrollEl.value, ROW_HEIGHT),
    }),
    {
      keys: 'o',
      fallbacks: ['<Enter>'],
      label: 'Download…',
      section: 'page',
      isEnabled: () => selected.value.size > 0,
      run: () => openAddDialog(),
    },
    {
      keys: '<Mod-a>',
      label: 'Select all results',
      section: 'page',
      run: () => (selected.value = new Set(props.results.map((result) => result.index))),
    },
  ],
);

defineExpose({
  resetScroll: () => {
    selected.value = new Set();
    anchor.value = null;
    scrollEl.value?.scrollTo({ top: 0 });
  },
});
</script>

<template>
  <div class="@container flex min-h-0 flex-1 flex-col text-xs">
    <div
      role="row"
      class="flex h-7 shrink-0 overflow-y-hidden bg-table-header px-1 text-muted-foreground shadow-[inset_0_-1px_0_var(--border)] [scrollbar-gutter:stable]"
    >
      <div
        v-for="column in RESULT_COLUMNS"
        :key="column.id"
        role="columnheader"
        :class="COLUMN_CLASS[column.id]"
        :aria-sort="ariaSort(column.id)"
      >
        <button
          type="button"
          class="flex h-7 w-full items-center gap-1 px-2 hover:text-foreground"
          :class="[column.isNumeric && 'justify-end', sort.id === column.id && 'text-foreground']"
          @click="sort = nextResultSort(sort, column)"
        >
          {{ column.label }}
          <template v-if="sort.id === column.id">
            <ArrowDown v-if="sort.desc" class="size-3" />
            <ArrowUp v-else class="size-3" />
          </template>
        </button>
      </div>
    </div>
    <div
      ref="scrollEl"
      class="min-h-0 flex-1 overflow-y-auto outline-none [scrollbar-gutter:stable]"
      tabindex="0"
      role="grid"
      aria-label="Search results"
      :aria-rowcount="results.length"
      aria-multiselectable="true"
    >
      <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <ContextMenu v-for="{ result, position, start } in visibleRows" :key="result.index">
          <ContextMenuTrigger as-child>
            <div
              role="row"
              :aria-selected="selected.has(result.index)"
              class="absolute top-0 left-0 flex w-full cursor-default items-center border-b border-divider px-1 select-none [&>div]:px-2"
              :class="selected.has(result.index) ? 'bg-selected' : 'hover:bg-row-hover'"
              :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${start}px)` }"
              @click="onRowClick($event, position)"
              @dblclick="openAddDialog([result])"
              @contextmenu="onRowContextMenu(position)"
            >
              <div role="gridcell" :class="COLUMN_CLASS.name">
                <span v-tooltip="result.name" class="block truncate text-compact">
                  {{ result.name }}
                </span>
              </div>
              <div role="gridcell" class="tabular-nums" :class="COLUMN_CLASS.size">
                {{ result.size === null ? '' : formatBytes(result.size) }}
              </div>
              <div
                role="gridcell"
                class="text-chart-upload tabular-nums"
                :class="COLUMN_CLASS.seeds"
              >
                {{ countOrBlank(result.seeds) }}
              </div>
              <div
                role="gridcell"
                class="text-chart-download tabular-nums"
                :class="COLUMN_CLASS.leechers"
              >
                {{ countOrBlank(result.leechers) }}
              </div>
              <div role="gridcell" class="text-muted-foreground" :class="COLUMN_CLASS.engine">
                <span v-tooltip="engineLabel(result)" class="truncate">
                  {{ engineLabel(result) }}
                </span>
              </div>
              <div
                role="gridcell"
                class="text-muted-foreground tabular-nums"
                :class="COLUMN_CLASS.published"
              >
                <span
                  v-if="result.publishedAt !== null"
                  v-tooltip="formatDate(result.publishedAt)"
                  >{{ formatRelativeTime(result.publishedAt) }}</span
                >
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @select="openAddDialog()"><Download />Download…</ContextMenuItem>
            <ContextMenuItem @select="downloadNow"><Zap />Download with defaults</ContextMenuItem>
            <ContextMenuItem :disabled="!selectionHasDescription()" @select="openDescriptions">
              <ExternalLink />Open description page
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem @select="copyField('name')"><Copy />Copy name</ContextMenuItem>
            <ContextMenuItem @select="copyField('url')"><Copy />Copy download link</ContextMenuItem>
            <ContextMenuItem @select="copyField('descriptionUrl')">
              <Copy />Copy description page URL
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      <slot name="empty" />
    </div>
  </div>
</template>
