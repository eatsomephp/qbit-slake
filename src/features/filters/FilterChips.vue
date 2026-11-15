<script setup lang="ts">
import { computed, type Component } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { Ban } from '@lucide/vue';
import { Chip } from '@/components/ui/chip';
import { useUiStore } from '@/stores/ui';
import {
  FILTER_GROUP_KEYS,
  clearValue,
  toggleExclude,
  toggleInclude,
  type FilterGroupKey,
  type StateFilter,
} from '@/lib/torrentFilters';
import { conditionLabel } from '@/lib/filterQuery';
import { ACTIVITY_LABELS, COMPLETION_LABELS, STATE_LABELS, chipLabel } from './filterLabels';

interface GroupFilterChip {
  key: string;
  group: FilterGroupKey;
  value: string;
  label: string;
  icon?: Component;
  isExcluded: boolean;
}

const [DefineGroupChip, GroupChip] = createReusableTemplate<{ chip: GroupFilterChip }>();

const ui = useUiStore();

function chipsFor(group: FilterGroupKey, values: string[], isExcluded: boolean): GroupFilterChip[] {
  return values.map((value) => ({
    key: `${group}:${isExcluded ? '-' : '+'}${value}`,
    group,
    value,
    label: chipLabel(group, value),
    icon: group === 'state' ? STATE_LABELS[value as StateFilter]?.icon : undefined,
    isExcluded,
  }));
}

const stateChips = computed(() => [
  ...chipsFor('state', ui.filters.state.include, false),
  ...chipsFor('state', ui.filters.state.exclude, true),
]);
const otherGroupChips = computed(() =>
  FILTER_GROUP_KEYS.filter((group) => group !== 'state').flatMap((group) => [
    ...chipsFor(group, ui.filters[group].include, false),
    ...chipsFor(group, ui.filters[group].exclude, true),
  ]),
);
const conditionChips = computed(() =>
  ui.filters.conditions.map((condition) => ({ condition, label: conditionLabel(condition) })),
);
type SingleSelectDimension = 'activity' | 'completion';

const singleSelectChips = computed(() => {
  const { activity, completion } = ui.filters;
  return [
    ...(activity ? [{ dimension: 'activity' as const, ...ACTIVITY_LABELS[activity] }] : []),
    ...(completion ? [{ dimension: 'completion' as const, ...COMPLETION_LABELS[completion] }] : []),
  ];
});

function flip(chip: GroupFilterChip) {
  ui.updateFilterGroup(chip.group, (g) =>
    chip.isExcluded ? toggleInclude(g, chip.value) : toggleExclude(g, chip.value),
  );
}

function remove(chip: GroupFilterChip) {
  ui.updateFilterGroup(chip.group, (g) => clearValue(g, chip.value));
}

function removeSingleSelect(dimension: SingleSelectDimension) {
  ui.filters = { ...ui.filters, [dimension]: null };
}

function removeCondition(index: number) {
  ui.filters = { ...ui.filters, conditions: ui.filters.conditions.toSpliced(index, 1) };
}
</script>

<template>
  <DefineGroupChip v-slot="{ chip }">
    <Chip
      :excluded="chip.isExcluded"
      :activate-label="`${chip.label}${chip.isExcluded ? ', excluded' : ''}. ${chip.isExcluded ? 'Include' : 'Exclude'} instead`"
      :activate-tooltip="chip.isExcluded ? 'Include instead' : 'Exclude instead'"
      :remove-label="`Remove ${chip.label}`"
      @activate="flip(chip)"
      @remove="remove(chip)"
    >
      <Ban v-if="chip.isExcluded" class="size-3 shrink-0 text-destructive/70" />
      <component :is="chip.icon" v-else-if="chip.icon" class="size-3 shrink-0" />
      <span class="truncate">{{ chip.label }}</span>
    </Chip>
  </DefineGroupChip>

  <GroupChip v-for="chip in stateChips" :key="chip.key" :chip="chip" />
  <Chip
    v-for="chip in singleSelectChips"
    :key="chip.dimension"
    :remove-label="`Remove ${chip.label}`"
    @remove="removeSingleSelect(chip.dimension)"
  >
    <component :is="chip.icon" class="size-3 shrink-0" />
    <span class="truncate">{{ chip.label }}</span>
  </Chip>
  <GroupChip v-for="chip in otherGroupChips" :key="chip.key" :chip="chip" />
  <Chip
    v-for="(chip, index) in conditionChips"
    :key="`${index}:${chip.label}`"
    :remove-label="`Remove ${chip.label}`"
    @remove="removeCondition(index)"
  >
    <span class="truncate tabular-nums">{{ chip.label }}</span>
  </Chip>
</template>
