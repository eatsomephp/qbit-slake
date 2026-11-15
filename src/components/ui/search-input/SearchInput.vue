<script setup lang="ts">
import { useTemplateRef, type HTMLAttributes } from 'vue';
import { Search, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

defineOptions({ inheritAttrs: false });

const query = defineModel<string>({ required: true });
const props = withDefaults(
  defineProps<{
    size?: 'default' | 'sm';
    clearable?: boolean;
    clearLabel?: string;
    class?: HTMLAttributes['class'];
  }>(),
  { size: 'default', clearable: true, clearLabel: 'Clear search', class: undefined },
);

const input = useTemplateRef<{ $el: HTMLInputElement }>('input');

function focus() {
  input.value?.$el.focus();
}

function clear() {
  query.value = '';
  focus();
}

function clearOnEscape(event: KeyboardEvent) {
  if (!query.value) return;
  // Otherwise a dialog or drawer around the field sees the same Escape and closes.
  event.stopPropagation();
  query.value = '';
}

defineExpose({ focus });
</script>

<template>
  <div :class="cn('relative flex min-w-0 items-center', props.class)">
    <Search
      class="pointer-events-none absolute text-muted-foreground"
      :class="size === 'sm' ? 'left-1.5 size-3' : 'left-2.5 size-3.5'"
      aria-hidden="true"
    />
    <Input
      v-bind="$attrs"
      ref="input"
      v-model="query"
      type="search"
      autocomplete="off"
      spellcheck="false"
      :class="
        cn(
          '[&::-webkit-search-cancel-button]:hidden',
          size === 'sm' ? 'h-6 pr-6 pl-6 text-xs md:text-xs' : 'pr-8 pl-8',
        )
      "
      @keydown.esc="clearOnEscape"
    />
    <Button
      v-if="clearable && query"
      type="button"
      variant="quiet"
      size="icon-2xs"
      class="absolute"
      :class="size === 'sm' ? 'right-0.5' : 'right-1.5'"
      :aria-label="clearLabel"
      @click="clear"
    >
      <X :class="size === 'sm' ? 'size-3' : 'size-3.5'" />
    </Button>
  </div>
</template>
