<script setup lang="ts">
import { ContextMenuContent, ContextMenuPortal } from 'reka-ui';
import { menuContentClass } from '../menu/menuClasses';

defineOptions({ inheritAttrs: false });
</script>

<template>
  <ContextMenuPortal>
    <ContextMenuContent
      v-bind="$attrs"
      :class="[menuContentClass, 'max-h-(--reka-context-menu-content-available-height)']"
    >
      <slot />
    </ContextMenuContent>
  </ContextMenuPortal>
</template>
