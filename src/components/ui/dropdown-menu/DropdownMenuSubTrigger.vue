<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { DropdownMenuSubTrigger } from 'reka-ui';
import { menuItemClass } from '../menu/menuClasses';

defineProps<{ disabled?: boolean }>();
</script>

<template>
  <DropdownMenuSubTrigger :disabled="disabled" :class="menuItemClass">
    <slot />
    <ChevronRight class="ml-auto" />
  </DropdownMenuSubTrigger>
</template>
