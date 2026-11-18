<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, useTemplateRef } from 'vue';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { withShortcut } from '@/shortcuts/engine';
import MenuShortcut from '@/shortcuts/MenuShortcut.vue';
import { COMMON_SORT_FIELDS, OTHER_SORT_FIELDS, sortFieldOf } from './columns';
import { sortMenuOpen } from './menuState';
import { useSortChoice, type SortDirection } from './useSortChoice';

const {
  fieldId,
  fieldLabel,
  direction,
  orderLabels,
  isDescending,
  directionLabel,
  reversedDirectionLabel,
  secondaryKeys,
  extraSortCount,
  flipDirection,
  removeSecondaryKey,
  clearSecondaryKeys,
} = useSortChoice();
const splitButton = useTemplateRef<HTMLElement>('splitButton');

const directionChoices = computed(() => {
  const descending = { value: 'desc', label: orderLabels.value.desc };
  const ascending = { value: 'asc', label: orderLabels.value.asc };
  return sortFieldOf(fieldId.value)?.descFirst ? [descending, ascending] : [ascending, descending];
});
const directionModel = computed({
  get: () => direction.value as string,
  set: (value: string) => (direction.value = value as SortDirection),
});

function keepMenuOpen(event: Event) {
  event.preventDefault();
}
</script>

<template>
  <div ref="splitButton" class="flex shrink-0 items-center rounded-md bg-muted/60">
    <DropdownMenu v-model:open="sortMenuOpen" :modal="false">
      <DropdownMenuTrigger as-child>
        <Button
          v-tooltip="withShortcut('Sort by', '<Space>us')"
          variant="muted"
          class="gap-1 rounded-r-none px-2"
          :aria-label="`Sort by ${fieldLabel}`"
        >
          <span class="max-w-36 truncate">{{ fieldLabel }}</span>
          <span v-if="extraSortCount" class="font-mono text-xs tabular-nums">
            +{{ extraSortCount }}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" :reference="splitButton ?? undefined" class="w-56">
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="directionModel">
          <DropdownMenuRadioItem
            v-for="choice in directionChoices"
            :key="choice.value"
            :value="choice.value"
            @select="keepMenuOpen"
          >
            {{ choice.label }}
            <MenuShortcut v-if="choice.value !== direction" keys="<Space>ur" />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="fieldId">
          <DropdownMenuRadioItem
            v-for="field in COMMON_SORT_FIELDS"
            :key="field.id"
            :value="field.id"
          >
            {{ field.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>More columns</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="fieldId">
          <DropdownMenuRadioItem
            v-for="field in OTHER_SORT_FIELDS"
            :key="field.id"
            :value="field.id"
          >
            {{ field.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <template v-if="secondaryKeys.length">
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Then by</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="key in secondaryKeys"
            :key="key.id"
            class="pl-7"
            :aria-label="`Remove secondary sort by ${key.label}`"
            @select="
              keepMenuOpen($event);
              removeSecondaryKey(key.id);
            "
          >
            <span class="min-w-0 flex-1 truncate">{{ key.label }}</span>
            <span class="text-xs text-muted-foreground">{{ key.directionLabel }}</span>
            <X />
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="secondaryKeys.length > 1"
            class="pl-7"
            @select="clearSecondaryKeys"
          >
            Clear secondary sorts
          </DropdownMenuItem>
        </template>
        <template v-else>
          <DropdownMenuSeparator />
          <p class="px-2 py-1 text-xs text-muted-foreground">
            Shift-click column headers to sort by more than one column.
          </p>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button
      v-tooltip="
        withShortcut(
          `${directionLabel}, click for ${reversedDirectionLabel.toLowerCase()}`,
          '<Space>ur',
        )
      "
      variant="muted"
      size="icon"
      class="rounded-l-none border-l border-border"
      :aria-label="`Sort order: ${directionLabel}`"
      @click="flipDirection"
    >
      <ArrowDownWideNarrow v-if="isDescending" />
      <ArrowUpNarrowWide v-else />
    </Button>
  </div>
</template>
