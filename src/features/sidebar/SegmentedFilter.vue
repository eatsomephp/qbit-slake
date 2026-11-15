<script setup lang="ts" generic="Value extends string">
import { computed } from 'vue';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented';

const props = defineProps<{
  label: string;
  values: readonly Value[];
  labels: Record<Value, { label: string }>;
  counts: Record<Value, number>;
}>();
const selected = defineModel<Value | null>({ required: true });

function option(value: Value | null, label: string, count: number): SegmentedOption<Value | null> {
  return {
    value,
    label,
    tooltip: `${label}: ${count.toLocaleString()} torrents`,
    dimmed: count === 0,
  };
}

const options = computed(() => [
  option(
    null,
    'Any',
    props.values.reduce((sum, value) => sum + props.counts[value], 0),
  ),
  ...props.values.map((value) => option(value, props.labels[value].label, props.counts[value])),
]);
</script>

<template>
  <SegmentedControl
    v-model="selected"
    :label="label"
    :options="options"
    size="sm"
    class="mx-2 mt-1"
  />
</template>
