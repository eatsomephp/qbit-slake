<script setup lang="ts">
import { computed } from 'vue';
import { Kbd } from '@/components/ui/kbd';
import { activeKeymaps, groupLabel, hintsAfter, keyState } from './engine';
import { tokenLabel } from './keys';

const hasPrefix = computed(() => keyState.pending.length > 0);
const MIN_ROWS = 8;
const MAX_COLUMNS = 4;

const hints = computed(() =>
  hasPrefix.value ? hintsAfter(activeKeymaps(), keyState.pending) : [],
);
const rowCount = computed(() => Math.max(MIN_ROWS, Math.ceil(hints.value.length / MAX_COLUMNS)));
const title = computed(() =>
  hasPrefix.value ? groupLabel(activeKeymaps(), keyState.pending) : undefined,
);
const typedKeys = computed(() => [
  ...(keyState.count === null ? [] : [String(keyState.count)]),
  ...keyState.pending.map(tokenLabel),
]);

const showsPanel = computed(() => keyState.showsHints && hints.value.length > 0);
const showsCountOnly = computed(() => keyState.showsHints && !hasPrefix.value);
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 bottom-4 z-60 flex flex-col items-end gap-field"
    aria-live="polite"
  >
    <div
      v-if="showsPanel"
      class="max-w-[min(42rem,calc(100vw-2rem))] rounded-lg border bg-popover p-gutter text-popover-foreground shadow-lg"
    >
      <div class="mb-field flex items-center gap-field text-xs">
        <Kbd v-for="(key, index) in typedKeys" :key="index">{{ key }}</Kbd>
        <span v-if="title" class="font-medium">{{ title }}</span>
      </div>
      <ul
        class="grid grid-flow-col gap-x-section gap-y-1 text-xs"
        :style="{ gridTemplateRows: `repeat(${rowCount}, auto)` }"
      >
        <li
          v-for="hint in hints"
          :key="hint.token"
          class="flex items-center gap-field whitespace-nowrap"
          :class="!hint.isEnabled && 'opacity-40'"
        >
          <Kbd class="min-w-6 text-foreground">{{ tokenLabel(hint.token) }}</Kbd>
          <span
            class="max-w-48 truncate"
            :class="hint.isGroup ? 'text-primary' : 'text-muted-foreground'"
          >
            {{ hint.isGroup ? `+${hint.label}` : hint.label }}
          </span>
        </li>
      </ul>
    </div>
    <div
      v-else-if="showsCountOnly"
      class="flex items-center gap-field rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
    >
      <Kbd v-for="(key, index) in typedKeys" :key="index">{{ key }}</Kbd>
    </div>
    <div
      v-if="keyState.isVisual"
      class="rounded-md border border-primary/40 bg-highlight px-2 py-0.5 font-mono text-2xs font-medium tracking-wide text-primary"
    >
      VISUAL
    </div>
  </div>
</template>
