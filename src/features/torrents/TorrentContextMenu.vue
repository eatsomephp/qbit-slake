<script setup lang="ts">
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import TorrentActionItems from './TorrentActionItems.vue';
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as="div" class="h-full">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <TorrentActionItems menu="context" />
    </ContextMenuContent>
  </ContextMenu>
</template>
