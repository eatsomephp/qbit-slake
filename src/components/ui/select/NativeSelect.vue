<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ChevronDown } from '@lucide/vue';
import { cn } from '@/lib/utils';

defineOptions({ inheritAttrs: false });

const model = defineModel<unknown>();
const props = withDefaults(
  defineProps<{ class?: HTMLAttributes['class']; size?: 'default' | 'sm' }>(),
  { class: undefined, size: 'default' },
);
</script>

<template>
  <span
    :class="
      cn(
        'relative inline-grid min-w-0 has-disabled:opacity-50',
        size === 'sm' ? 'h-6 text-xs' : 'h-8 text-sm',
        props.class,
      )
    "
  >
    <select
      v-bind="$attrs"
      v-model="model"
      data-slot="select"
      :class="
        cn(
          'col-start-1 row-start-1 size-full min-w-0 appearance-none rounded-md border border-input bg-transparent text-[length:inherit] transition-[color,box-shadow,border-color] outline-none hover:border-muted-foreground/40 disabled:cursor-not-allowed dark:bg-input/30 [&>option]:bg-popover',
          'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
          size === 'sm' ? 'pr-6 pl-1.5' : 'pr-8 pl-2.5',
        )
      "
    >
      <slot />
    </select>
    <ChevronDown
      aria-hidden="true"
      :class="
        cn(
          'pointer-events-none col-start-1 row-start-1 self-center justify-self-end text-muted-foreground',
          size === 'sm' ? 'mr-1.5 size-3' : 'mr-2.5 size-3.5',
        )
      "
    />
  </span>
</template>
