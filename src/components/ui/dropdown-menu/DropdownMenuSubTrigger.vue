<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ChevronRight } from '@lucide/vue';
import { DropdownMenuSubTrigger } from 'reka-ui';
import { cn } from '@/lib/utils';
import { menuItemClass } from '../menu/menuClasses';

defineProps<{ disabled?: boolean; class?: HTMLAttributes['class'] }>();
</script>

<template>
  <DropdownMenuSubTrigger :disabled="disabled" :class="cn(menuItemClass, $props.class)">
    <slot />
    <ChevronRight class="ml-auto" />
  </DropdownMenuSubTrigger>
</template>
