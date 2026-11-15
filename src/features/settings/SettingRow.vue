<script setup lang="ts">
defineProps<{ label: string; hint?: string; for?: string; rawKeys?: readonly string[] }>();
</script>

<template>
  <div class="grid items-center gap-x-form gap-y-field sm:grid-cols-[16rem_1fr]">
    <div>
      <label :for="$props.for" class="text-sm">{{ label }}</label>
      <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
      <p v-if="rawKeys?.length" class="font-mono text-xs break-all text-muted-foreground">
        {{ rawKeys.join(', ') }}
      </p>
    </div>
    <div class="flex min-w-0 items-center gap-2">
      <slot />
    </div>
  </div>
</template>
