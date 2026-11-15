<script setup lang="ts">
import { Check, Minus } from '@lucide/vue';
import { DropdownMenuCheckboxItem, DropdownMenuItemIndicator } from 'reka-ui';
import { menuIndicatorClass, menuIndicatorItemClass } from '../menu/menuClasses';

/** `true`, `false` or `'indeterminate'` (some of the selection). */
defineProps<{ modelValue: boolean | 'indeterminate' }>();
defineEmits<{ select: [event: Event] }>();
</script>

<template>
  <DropdownMenuCheckboxItem
    :model-value="modelValue"
    :class="menuIndicatorItemClass"
    @select="$emit('select', $event)"
  >
    <span :class="menuIndicatorClass">
      <DropdownMenuItemIndicator>
        <Minus v-if="modelValue === 'indeterminate'" />
        <Check v-else />
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuCheckboxItem>
</template>
