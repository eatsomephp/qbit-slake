<script setup lang="ts">
import SortControl from './SortControl.vue';

defineProps<{ count: number }>();
</script>

<template>
  <div class="flex shrink-0 items-center gap-2 border-b px-3 text-sm text-muted-foreground">
    <span>Sort</span>
    <SortControl />
    <span class="ml-1 font-mono text-xs tabular-nums">{{ count.toLocaleString() }}</span>
  </div>
</template>
