<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { COMMON_SORT_FIELDS, OTHER_SORT_FIELDS } from './columns';
import { useSortChoice } from './useSortChoice';

const { fieldId, isDescending, directionLabel, reversedDirectionLabel, flipDirection } =
  useSortChoice();
</script>

<template>
  <NativeSelect v-model="fieldId" aria-label="Sort by" class="min-w-0 flex-1 text-foreground">
    <optgroup label="Common">
      <option v-for="field in COMMON_SORT_FIELDS" :key="field.id" :value="field.id">
        {{ field.label }}
      </option>
    </optgroup>
    <optgroup label="More columns">
      <option v-for="field in OTHER_SORT_FIELDS" :key="field.id" :value="field.id">
        {{ field.label }}
      </option>
    </optgroup>
  </NativeSelect>
  <Button
    v-tooltip="`${directionLabel}, tap for ${reversedDirectionLabel.toLowerCase()}`"
    variant="outline"
    size="icon"
    :aria-label="`Sort order: ${directionLabel}`"
    @click="flipDirection"
  >
    <ArrowDownWideNarrow v-if="isDescending" />
    <ArrowUpNarrowWide v-else />
  </Button>
</template>
