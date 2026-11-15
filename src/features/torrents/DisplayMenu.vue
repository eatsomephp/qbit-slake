<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { Columns3Cog, LayoutList, Rows3, Rows4 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented';
import { useUiStore, type TableView } from '@/stores/ui';
import { HIDEABLE_COLUMNS, useColumnVisibility } from './useColumnVisibility';
import SortControl from './SortControl.vue';

const ui = useUiStore();
const columns = useColumnVisibility();

const LAYOUTS: SegmentedOption<TableView>[] = [
  { value: 'stacked', label: 'Stacked', icon: LayoutList },
  { value: 'comfortable', label: 'Comfortable', icon: Rows3 },
  { value: 'compact', label: 'Compact', icon: Rows4 },
];

const columnsApply = computed(() => ui.tableView !== 'stacked');
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        v-tooltip="'Layout, sort and columns'"
        variant="muted"
        size="icon-sm"
        class="shrink-0"
        aria-label="Display options"
      >
        <Columns3Cog />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="flex max-h-[80vh] w-88 flex-col gap-3 overflow-y-auto">
      <section class="flex flex-col gap-1.5">
        <h3 class="text-xs font-medium text-muted-foreground">Layout</h3>
        <SegmentedControl v-model="ui.tableView" label="Layout" :options="LAYOUTS" />
      </section>
      <section class="flex flex-col gap-1.5">
        <h3 class="text-xs font-medium text-muted-foreground">Sort</h3>
        <div class="flex items-center gap-1.5">
          <SortControl />
        </div>
      </section>
      <label class="flex items-center gap-2 text-sm">
        <Checkbox v-model="ui.multiSelect" />
        Multi-select
        <span class="text-xs text-muted-foreground">(clicks add to selection)</span>
      </label>
      <section class="flex flex-col gap-1.5 border-t pt-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-medium text-muted-foreground">Columns</h3>
          <Button variant="ghost" size="xs" :disabled="!columnsApply" @click="columns.resetLayout">
            Reset
          </Button>
        </div>
        <p v-if="!columnsApply" class="text-xs text-muted-foreground">
          The stacked layout has fixed columns.
        </p>
        <fieldset
          :disabled="!columnsApply"
          class="grid grid-cols-2 gap-x-3 gap-y-1.5 disabled:opacity-50"
        >
          <legend class="sr-only">Visible columns</legend>
          <label
            v-for="column in HIDEABLE_COLUMNS"
            :key="column.id"
            class="flex min-w-0 items-center gap-2 text-sm"
          >
            <Checkbox
              :model-value="columns.isVisible(column.id)"
              :disabled="!columnsApply"
              @update:model-value="columns.toggle(column.id)"
            />
            <span class="truncate">{{ column.label }}</span>
          </label>
        </fieldset>
      </section>
    </PopoverContent>
  </Popover>
</template>
