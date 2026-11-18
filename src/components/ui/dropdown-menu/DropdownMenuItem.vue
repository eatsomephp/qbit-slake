<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DropdownMenuItem } from 'reka-ui';
import { cn } from '@/lib/utils';
import { menuDestructiveItemClass, menuItemClass } from '../menu/menuClasses';

defineProps<{ destructive?: boolean; disabled?: boolean; class?: HTMLAttributes['class'] }>();
defineEmits<{ select: [event: Event] }>();
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :class="cn(menuItemClass, destructive && menuDestructiveItemClass, $props.class)"
    @select="$emit('select', $event)"
  >
    <slot />
  </DropdownMenuItem>
</template>
