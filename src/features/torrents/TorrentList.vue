<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Check } from '@lucide/vue';
import { useTorrentsStore } from '@/stores/torrents';
import { useSelectionStore } from '@/stores/selection';
import { mobileDetailsOpen } from './mobileState';
import TorrentSortBar from './TorrentSortBar.vue';
import TorrentSummary from './TorrentSummary.vue';

/** Phone layout: two-line rows over the same store and virtualizer pattern as the table. */
const ROW_HEIGHT = 56;

const torrents = useTorrentsStore();
const selection = useSelectionStore();

const rows = computed(() => torrents.filteredSorted);
const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (i: number) => rows.value[i]!.hash,
    overscan: 8,
    initialRect: { width: 400, height: 800 },
  })),
);
const visible = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((v) => v.index < rows.value.length)
    .map((v) => ({ t: rows.value[v.index]!, start: v.start })),
);

function open(hash: string) {
  selection.selectOnly(hash);
  mobileDetailsOpen.value = true;
}

watch(mobileDetailsOpen, (isOpen) => {
  if (!isOpen) selection.clear();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TorrentSortBar :count="rows.length" class="h-9" />

    <div ref="scrollEl" class="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="list">
      <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <div
          v-for="{ t, start } in visible"
          :key="t.hash"
          v-memo="[t, t.rev, start, selection.has(t.hash)]"
          role="listitem"
          :data-hash="t.hash"
          class="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-divider pr-3"
          :class="selection.has(t.hash) && 'bg-selected'"
          :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${start}px)` }"
        >
          <button
            type="button"
            class="flex h-full w-11 shrink-0 items-center justify-center"
            :aria-label="selection.has(t.hash) ? `Deselect ${t.name}` : `Select ${t.name}`"
            :aria-pressed="selection.has(t.hash)"
            @click="selection.toggle(t.hash)"
          >
            <span
              class="flex size-5 items-center justify-center rounded-full border"
              :class="selection.has(t.hash) && 'border-primary bg-primary text-primary-foreground'"
            >
              <Check v-if="selection.has(t.hash)" class="size-3" />
            </span>
          </button>
          <button type="button" class="flex h-full min-w-0 flex-1 text-left" @click="open(t.hash)">
            <TorrentSummary :torrent="t" :rev="t.rev" layout="narrow" />
          </button>
        </div>
      </div>
      <p
        v-if="!rows.length && torrents.connection !== 'connecting'"
        class="p-4 text-center text-sm text-muted-foreground"
      >
        {{ torrents.all.length ? 'No torrents match the current filters.' : 'No torrents yet.' }}
      </p>
    </div>
  </div>
</template>
