<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useTemplateRef } from 'vue';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { withShortcut } from '@/shortcuts/engine';
import { COMMON_SORT_FIELDS, OTHER_SORT_FIELDS } from './columns';
import { sortMenuOpen } from './menuState';
import { useSortChoice } from './useSortChoice';

const { fieldId, fieldLabel, isDescending, directionLabel, extraSortCount, flipDirection } =
  useSortChoice();
const splitButton = useTemplateRef<HTMLElement>('splitButton');
</script>

<template>
  <div ref="splitButton" class="flex shrink-0 items-center">
    <Button
      v-tooltip="withShortcut(directionLabel, '<Space>ur')"
      variant="muted"
      size="icon"
      class="rounded-r-none"
      :aria-label="`Sort ${directionLabel.toLowerCase()}`"
      @click="flipDirection"
    >
      <ArrowDownWideNarrow v-if="isDescending" />
      <ArrowUpNarrowWide v-else />
    </Button>
    <DropdownMenu v-model:open="sortMenuOpen" :modal="false">
      <DropdownMenuTrigger as-child>
        <Button
          v-tooltip="
            withShortcut(
              extraSortCount ? 'Sort by (shift-click headers for more keys)' : 'Sort by',
              '<Space>us',
            )
          "
          variant="muted"
          class="gap-1 rounded-l-none pr-2 pl-1"
          :aria-label="`Sort by ${fieldLabel}`"
        >
          <span class="max-w-36 truncate">{{ fieldLabel }}</span>
          <span v-if="extraSortCount" class="font-mono text-xs tabular-nums">
            +{{ extraSortCount }}
          </span>
          <ChevronDown class="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" :reference="splitButton ?? undefined" class="max-h-96">
        <DropdownMenuRadioGroup v-model="fieldId">
          <DropdownMenuLabel>Common</DropdownMenuLabel>
          <DropdownMenuRadioItem
            v-for="field in COMMON_SORT_FIELDS"
            :key="field.id"
            :value="field.id"
          >
            {{ field.label }}
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>More columns</DropdownMenuLabel>
          <DropdownMenuRadioItem
            v-for="field in OTHER_SORT_FIELDS"
            :key="field.id"
            :value="field.id"
          >
            {{ field.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
