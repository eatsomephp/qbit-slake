<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <kbd
    :class="
      cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted/60 px-1 font-mono text-2xs text-muted-foreground',
        props.class,
      )
    "
  >
    <slot />
  </kbd>
</template>
