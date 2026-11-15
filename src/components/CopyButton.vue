<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { Button, revealOnRowHover } from '@/components/ui/button';
import { useCopyText } from '@/composables/useCopyText';

withDefaults(defineProps<{ text: string; label: string; tooltip?: string }>(), {
  tooltip: 'Copy',
});

const copyText = useCopyText();
</script>

<template>
  <Button
    v-tooltip="tooltip"
    type="button"
    variant="quiet"
    size="icon-2xs"
    :class="['shrink-0', revealOnRowHover]"
    :aria-label="label"
    @click="copyText(text)"
  >
    <Copy class="size-3" />
  </Button>
</template>
