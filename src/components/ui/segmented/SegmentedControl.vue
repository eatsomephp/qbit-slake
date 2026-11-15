<script setup lang="ts" generic="Value">
import { ref, type HTMLAttributes } from 'vue';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { cn } from '@/lib/utils';
import type { SegmentedOption } from './types';

const props = withDefaults(
  defineProps<{
    label: string;
    options: readonly SegmentedOption<Value>[];
    size?: 'default' | 'sm';
    class?: HTMLAttributes['class'];
  }>(),
  { size: 'default', class: undefined },
);
const selected = defineModel<Value>({ required: true });

const optionButtons = ref<HTMLButtonElement[]>([]);

function moveSelection(event: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const current = props.options.findIndex((option) => option.value === selected.value);
  const next = (current + step + props.options.length) % props.options.length;
  selected.value = props.options[next]!.value;
  optionButtons.value[next]?.focus();
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    :class="cn('grid', size === 'sm' ? 'gap-px rounded-md bg-muted p-0.5' : 'gap-2', props.class)"
    :style="{
      gridTemplateColumns: `repeat(${options.length}, ${size === 'sm' ? 'minmax(0, 1fr)' : '1fr'})`,
    }"
    @keydown="moveSelection"
  >
    <button
      v-for="option in options"
      :key="option.label"
      ref="optionButtons"
      v-tooltip="option.tooltip"
      type="button"
      role="radio"
      :aria-checked="selected === option.value"
      :tabindex="selected === option.value ? 0 : -1"
      class="flex min-w-0 items-center justify-center transition-colors"
      :class="[
        size === 'sm'
          ? 'h-5 rounded px-1 text-2xs aria-checked:bg-background aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-xs'
          : 'h-8 gap-1.5 rounded-md px-3 text-xs font-medium whitespace-nowrap ring-1 ring-border ring-inset hover:bg-accent aria-checked:bg-highlight aria-checked:text-primary aria-checked:ring-primary/40 [&_svg]:size-3.5',
        selected !== option.value && 'text-muted-foreground hover:text-foreground',
        selected !== option.value && option.dimmed && 'opacity-50',
      ]"
      @click="selected = option.value"
    >
      <component :is="option.icon" v-if="option.icon" class="shrink-0" /><span
        :class="size === 'sm' && 'truncate'"
        >{{ option.label }}</span
      >
    </button>
  </div>
</template>
