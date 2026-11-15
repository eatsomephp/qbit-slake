<script setup lang="ts">
import { Check } from '@lucide/vue';
import { DropdownMenuItemIndicator, DropdownMenuRadioItem } from 'reka-ui';
import { menuIndicatorClass, menuIndicatorItemClass } from '../menu/menuClasses';

defineProps<{ value: string }>();
</script>

<template>
  <DropdownMenuRadioItem :value="value" :class="menuIndicatorItemClass">
    <span :class="menuIndicatorClass">
      <DropdownMenuItemIndicator>
        <Check />
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuRadioItem>
</template>
