<script setup lang="ts">
import { DropdownMenuPortal, DropdownMenuSubContent } from 'reka-ui';
import { menuSubContentClass } from '../menu/menuClasses';
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuSubContent :side-offset="4" :class="menuSubContentClass">
      <slot />
    </DropdownMenuSubContent>
  </DropdownMenuPortal>
</template>
