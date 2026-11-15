<script setup lang="ts">
import { ContextMenuItem } from 'reka-ui';
import { cn } from '@/lib/utils';
import { menuDestructiveItemClass, menuItemClass } from '../menu/menuClasses';

defineProps<{ destructive?: boolean; disabled?: boolean }>();
defineEmits<{ select: [event: Event] }>();
</script>

<template>
  <ContextMenuItem
    :disabled="disabled"
    :class="cn(menuItemClass, destructive && menuDestructiveItemClass)"
    @select="$emit('select', $event)"
  >
    <slot />
  </ContextMenuItem>
</template>
