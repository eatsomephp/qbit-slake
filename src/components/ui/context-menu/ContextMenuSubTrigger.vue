<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { ContextMenuSubTrigger } from 'reka-ui';
import { menuItemClass } from '../menu/menuClasses';

defineProps<{ disabled?: boolean }>();
</script>

<template>
  <ContextMenuSubTrigger :disabled="disabled" :class="menuItemClass">
    <slot />
    <ChevronRight class="ml-auto" />
  </ContextMenuSubTrigger>
</template>
