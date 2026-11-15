<script setup lang="ts">
import SortControl from './SortControl.vue';

defineProps<{ count: number }>();
</script>

<template>
  <div class="flex shrink-0 items-center gap-1 border-b px-2 text-xs text-muted-foreground">
    <span>Sort</span>
    <SortControl size="sm" />
    <span class="ml-auto font-mono tabular-nums">{{ count.toLocaleString() }}</span>
  </div>
</template>
