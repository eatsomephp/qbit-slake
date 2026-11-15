<script setup lang="ts">
import { ContextMenuPortal, ContextMenuSubContent } from 'reka-ui';
import { menuSubContentClass } from '../menu/menuClasses';
</script>

<template>
  <ContextMenuPortal>
    <ContextMenuSubContent :class="menuSubContentClass">
      <slot />
    </ContextMenuSubContent>
  </ContextMenuPortal>
</template>
