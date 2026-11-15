<script setup lang="ts">
withDefaults(defineProps<{ pressed: boolean; size?: 'default' | 'sm' }>(), {
  size: 'default',
});
</script>

<template>
  <button
    type="button"
    :aria-pressed="pressed"
    class="rounded-md border text-xs transition-colors"
    :class="[
      size === 'sm' ? 'h-6 px-2' : 'h-7 px-2.5',
      pressed
        ? 'border-primary bg-highlight text-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-accent/50',
    ]"
  >
    <slot />
  </button>
</template>
