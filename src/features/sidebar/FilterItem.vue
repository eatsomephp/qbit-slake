<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, useId, type Component } from 'vue';
import { Ban, ChevronRight } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import type { FilterMark } from '@/lib/torrentFilters';
import { formatBytes } from '@/lib/format';

const props = withDefaults(
  defineProps<{
    label: string;
    count: number;
    icon?: Component;
    mark: FilterMark;
    isSyntheticEntry?: boolean;
    treeDepth?: number;
    hasChildren?: boolean;
    childrenExpanded?: boolean;
    totalSizeBytes?: number;
  }>(),
  { treeDepth: undefined, totalSizeBytes: undefined },
);
const emit = defineEmits<{ toggle: []; toggleExclude: []; toggleChildren: [] }>();

const countId = useId();
const isTreeRow = computed(() => props.treeDepth !== undefined);

const labelTooltip = computed(() =>
  props.totalSizeBytes === undefined
    ? props.label
    : `${props.label}\n${formatBytes(props.totalSizeBytes)}`,
);

function onRowClick(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) emit('toggleExclude');
  else emit('toggle');
}
</script>

<template>
  <li>
    <div
      class="group/row relative flex h-7 items-center rounded-md transition-colors"
      :class="
        mark === 'include'
          ? 'bg-selected before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
          : 'hover:bg-sidebar-accent'
      "
      :style="isTreeRow ? { paddingLeft: `${treeDepth! * 12}px` } : undefined"
    >
      <button
        v-if="hasChildren"
        type="button"
        class="relative z-10 flex h-full w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        :aria-label="childrenExpanded ? `Collapse ${label}` : `Expand ${label}`"
        :aria-expanded="childrenExpanded"
        @click="$emit('toggleChildren')"
      >
        <ChevronRight
          class="size-3 transition-transform"
          :class="childrenExpanded && 'rotate-90'"
        />
      </button>
      <span v-else-if="isTreeRow" class="w-5 shrink-0" />
      <button
        type="button"
        class="flex h-full min-w-0 flex-1 items-center gap-2 pr-1 text-left text-compact after:absolute after:inset-0 after:rounded-md"
        :class="[
          !isTreeRow && 'pl-2',
          mark === 'include' && 'font-medium',
          count === 0 && !mark && 'opacity-50',
        ]"
        :aria-pressed="mark === 'include' ? 'true' : mark === 'exclude' ? 'mixed' : 'false'"
        :aria-describedby="countId"
        @click="onRowClick"
      >
        <Ban v-if="mark === 'exclude'" class="size-3.5 shrink-0 text-destructive/70" />
        <component
          :is="icon"
          v-else-if="icon"
          class="size-3.5 shrink-0"
          :class="
            mark === 'include'
              ? 'text-primary'
              : 'text-muted-foreground group-hover/row:text-foreground'
          "
        />
        <span
          v-tooltip="labelTooltip"
          class="min-w-0 flex-1 truncate"
          :class="[
            isSyntheticEntry && !mark && 'text-muted-foreground italic',
            mark === 'exclude' && 'text-muted-foreground',
          ]"
        >
          {{ label }}
        </span>
        <span v-if="mark === 'exclude'" class="sr-only">excluded</span>
      </button>
      <Button
        v-tooltip="mark === 'exclude' ? 'Stop excluding' : 'Exclude'"
        variant="quiet"
        size="icon-2xs"
        :class="[
          'relative z-10 hover:bg-sidebar-border hover:text-destructive',
          mark === 'exclude'
            ? 'text-destructive/70'
            : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:hidden',
        ]"
        :aria-label="`Exclude ${label}`"
        :aria-pressed="mark === 'exclude'"
        @click="$emit('toggleExclude')"
      >
        <Ban class="size-3" />
      </Button>
      <span
        :id="countId"
        class="pointer-events-none min-w-6 pr-1.5 text-right font-mono text-2xs text-muted-foreground tabular-nums"
        :class="count === 0 && !mark && 'opacity-50'"
      >
        {{ count.toLocaleString() }}
      </span>
    </div>
  </li>
</template>
