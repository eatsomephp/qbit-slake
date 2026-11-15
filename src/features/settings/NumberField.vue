<script setup lang="ts">
import { Input } from '@/components/ui/input';

const value = defineModel<number>({ required: true });
defineProps<{
  id?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: string;
  disabled?: boolean;
}>();

function onInput(e: Event) {
  const n = (e.target as HTMLInputElement).valueAsNumber;
  value.value = Number.isFinite(n) ? n : 0;
}
</script>

<template>
  <Input
    :id="id"
    type="number"
    :model-value="value"
    :min="min"
    :max="max"
    :step="step ?? '1'"
    :disabled="disabled"
    class="w-28 font-mono tabular-nums"
    @input="onInput"
  />
  <span v-if="unit" class="text-xs text-muted-foreground">{{ unit }}</span>
</template>
