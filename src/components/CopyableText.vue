<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useCopyText } from '@/composables/useCopyText';

withDefaults(defineProps<{ text: string; label: string; wrap?: boolean }>(), { wrap: false });

const copyText = useCopyText();
</script>

<template>
  <button
    v-tooltip="text"
    type="button"
    :aria-label="label"
    class="group/copy flex min-w-0 cursor-copy gap-1 rounded-sm text-left"
    :class="wrap ? 'items-start' : 'items-center'"
    @click="copyText(text)"
  >
    <span :class="wrap ? 'break-all' : 'truncate'"
      ><slot>{{ text }}</slot></span
    >
    <Copy
      class="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover/copy:text-foreground group-focus-visible/copy:opacity-100 pointer-coarse:opacity-100"
      :class="wrap && 'mt-0.5'"
    />
  </button>
</template>
