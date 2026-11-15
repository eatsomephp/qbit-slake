<script setup lang="ts">
import { computed } from 'vue';
import { LIMIT_GLOBAL, LIMIT_NONE } from '@/constants/qbit';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';

/** A share limit: LIMIT_GLOBAL, LIMIT_NONE, or a value (ratio or minutes). */
const value = defineModel<number>({ required: true });
const props = defineProps<{
  label: string;
  unit: string;
  step?: string;
  customDefault: number;
  inheritLabel: string;
  compact?: boolean;
}>();

const mode = computed({
  get: () =>
    value.value === LIMIT_GLOBAL ? 'global' : value.value === LIMIT_NONE ? 'none' : 'custom',
  set: (m) => {
    value.value = m === 'global' ? LIMIT_GLOBAL : m === 'none' ? LIMIT_NONE : props.customDefault;
  },
});
</script>

<template>
  <div
    class="grid items-center gap-x-2"
    :class="compact ? 'grid-cols-[8rem_1fr] gap-y-field' : 'grid-cols-[9rem_9rem_1fr]'"
  >
    <span class="text-sm">{{ label }}</span>
    <NativeSelect v-model="mode" :aria-label="`${label} mode`">
      <option value="global">{{ inheritLabel }}</option>
      <option value="none">No limit</option>
      <option value="custom">Custom</option>
    </NativeSelect>
    <div v-if="mode === 'custom'" class="flex items-center gap-2" :class="compact && 'col-start-2'">
      <Input
        v-model.number="value"
        type="number"
        min="0"
        :step="step ?? '1'"
        :aria-label="label"
        class="w-24 font-mono tabular-nums"
      />
      <span class="text-xs text-muted-foreground">{{ unit }}</span>
    </div>
  </div>
</template>
