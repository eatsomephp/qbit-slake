<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { useUiStore } from '@/stores/ui';
import { SORTABLE_FIELDS } from './columns';

withDefaults(defineProps<{ size?: 'default' | 'sm' }>(), { size: 'default' });

const ui = useUiStore();

const sortId = computed({
  get: () => ui.sorting[0]?.id ?? 'addedOn',
  set: (id) => (ui.sorting = [{ id, desc: ui.sorting[0]?.desc ?? true }]),
});
const directionLabel = computed(() => (ui.sorting[0]?.desc ? 'Descending' : 'Ascending'));

function flipSortDirection() {
  const primary = ui.sorting[0] ?? { id: 'addedOn', desc: true };
  ui.sorting = [{ id: primary.id, desc: !primary.desc }];
}
</script>

<template>
  <NativeSelect
    v-model="sortId"
    aria-label="Sort by"
    :size="size"
    class="text-foreground"
    :class="size === 'default' && 'flex-1'"
  >
    <option v-for="field in SORTABLE_FIELDS" :key="field.id" :value="field.id">
      {{ field.label }}
    </option>
  </NativeSelect>
  <Button
    v-tooltip="directionLabel"
    :variant="size === 'sm' ? 'ghost' : 'outline'"
    :size="size === 'sm' ? 'icon-xs' : 'icon'"
    :aria-label="directionLabel"
    @click="flipSortDirection"
  >
    <ArrowDownWideNarrow v-if="ui.sorting[0]?.desc" />
    <ArrowUpNarrowWide v-else />
  </Button>
</template>
