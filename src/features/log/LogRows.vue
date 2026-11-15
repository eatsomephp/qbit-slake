<script setup lang="ts" generic="Entry extends { id: number }">
import { computed, nextTick, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { scrollMotions, useFocusedKeymap } from '@/shortcuts/lists';

const props = withDefaults(
  defineProps<{
    entries: readonly Entry[];
    rowHeight?: number;
    rowClass?: (entry: Entry) => string;
  }>(),
  { rowHeight: 24, rowClass: undefined },
);
defineSlots<{ default(props: { entry: Entry }): unknown }>();

const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.entries.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => props.rowHeight,
    overscan: 20,
    initialRect: { width: 1000, height: 800 },
  })),
);
const visible = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((v) => v.index < props.entries.length)
    .map((v) => ({ entry: props.entries[v.index]!, start: v.start })),
);

useFocusedKeymap(
  () => scrollEl.value,
  () => scrollMotions(() => scrollEl.value, props.rowHeight),
);

// Follow new entries while the user is at the bottom, like `tail -f`.
let atBottom = true;
function onScroll() {
  const el = scrollEl.value;
  if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < props.rowHeight * 2;
}
watch(
  () => props.rowHeight,
  () => virtualizer.value.measure(),
);
watch(
  () => props.entries.length,
  async (n) => {
    if (!atBottom || !n) return;
    await nextTick();
    virtualizer.value.scrollToIndex(n - 1, { align: 'end' });
  },
);
</script>

<template>
  <div
    ref="scrollEl"
    class="min-h-0 flex-1 overflow-auto outline-none"
    tabindex="0"
    @scroll.passive="onScroll"
  >
    <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="{ entry, start } in visible"
        :key="entry.id"
        class="absolute top-0 left-0 flex w-full items-center gap-3 px-3 font-mono text-xs whitespace-nowrap"
        :class="rowClass?.(entry)"
        :style="{ height: `${rowHeight}px`, transform: `translateY(${start}px)` }"
      >
        <slot :entry="entry" />
      </div>
    </div>
    <p v-if="!entries.length" class="p-3 text-xs text-muted-foreground">No log entries.</p>
  </div>
</template>
