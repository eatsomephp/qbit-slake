<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';

const selection = useSelectionStore();
const torrents = useTorrentsStore();

const position = computed(() => {
  const members = selection.selectedIn(torrents.filteredSorted);
  const index = members.findIndex((t) => t.hash === selection.detailsHash);
  return `${index < 0 ? '–' : index + 1} / ${members.length}`;
});

function step(direction: 1 | -1) {
  selection.viewStep(direction, torrents.filteredSorted);
}
</script>

<template>
  <div
    role="group"
    aria-label="Step through selected torrents"
    class="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
    @click.stop
  >
    <Button
      v-tooltip="'Previous selected torrent (← or H)'"
      variant="muted"
      size="icon-xs"
      aria-label="Previous selected torrent"
      @click="step(-1)"
    >
      <ChevronLeft class="size-4" />
    </Button>
    <span class="min-w-10 text-center tabular-nums" aria-live="polite">{{ position }}</span>
    <Button
      v-tooltip="'Next selected torrent (→ or L)'"
      variant="muted"
      size="icon-xs"
      aria-label="Next selected torrent"
      @click="step(1)"
    >
      <ChevronRight class="size-4" />
    </Button>
  </div>
</template>
