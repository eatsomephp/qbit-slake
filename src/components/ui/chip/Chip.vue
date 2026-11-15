<script setup lang="ts">
import { X } from '@lucide/vue';
import { vTooltip } from '@/components/tooltip/vTooltip';

defineProps<{
  removeLabel: string;
  removeTooltip?: string;
  excluded?: boolean;
  activateLabel?: string;
  activateTooltip?: string;
}>();
defineEmits<{ activate: []; remove: [] }>();
</script>

<template>
  <span
    data-chip
    class="inline-flex h-6 max-w-64 shrink-0 items-center gap-0.5 rounded-md bg-background pr-0.5 text-xs font-medium whitespace-nowrap shadow-xs ring-1 ring-border/60 tabular-nums"
    :class="excluded ? 'text-muted-foreground' : 'text-foreground'"
  >
    <button
      v-if="activateLabel"
      v-tooltip="activateTooltip"
      type="button"
      class="flex h-full min-w-0 items-center gap-1 rounded-l-md pl-2"
      :aria-label="activateLabel"
      @click="$emit('activate')"
    >
      <slot />
    </button>
    <span v-else class="flex min-w-0 items-center gap-1 pl-2">
      <slot />
    </span>
    <button
      v-tooltip="removeTooltip"
      type="button"
      class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      :aria-label="removeLabel"
      @click="$emit('remove')"
    >
      <X class="size-3.5" />
    </button>
  </span>
</template>
