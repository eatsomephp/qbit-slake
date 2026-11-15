<script setup lang="ts">
import { Check, Minus } from '@lucide/vue';
import { ContextMenuCheckboxItem, ContextMenuItemIndicator } from 'reka-ui';
import { menuIndicatorClass, menuIndicatorItemClass } from '../menu/menuClasses';

/** `true`, `false` or `'indeterminate'` (some of the selection). */
defineProps<{ modelValue: boolean | 'indeterminate' }>();
defineEmits<{ select: [event: Event] }>();
</script>

<template>
  <ContextMenuCheckboxItem
    :model-value="modelValue"
    :class="menuIndicatorItemClass"
    @select="$emit('select', $event)"
  >
    <span :class="menuIndicatorClass">
      <ContextMenuItemIndicator>
        <Minus v-if="modelValue === 'indeterminate'" />
        <Check v-else />
      </ContextMenuItemIndicator>
    </span>
    <slot />
  </ContextMenuCheckboxItem>
</template>
