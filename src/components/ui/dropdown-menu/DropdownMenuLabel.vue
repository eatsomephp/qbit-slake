<script setup lang="ts">
import { DropdownMenuLabel } from 'reka-ui';
import { menuLabelClass } from '../menu/menuClasses';
</script>

<template>
  <DropdownMenuLabel :class="menuLabelClass">
    <slot />
  </DropdownMenuLabel>
</template>
