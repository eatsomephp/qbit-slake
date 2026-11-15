<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { PopoverContent, PopoverPortal } from 'reka-ui';
import { cn } from '@/lib/utils';

withDefaults(
  defineProps<{
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    class?: HTMLAttributes['class'];
  }>(),
  { side: 'bottom', align: 'center', class: undefined },
);
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      :side="side"
      :align="align"
      :side-offset="6"
      :class="
        cn(
          'z-50 rounded-lg border bg-popover p-gutter text-sm text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          $props.class,
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
