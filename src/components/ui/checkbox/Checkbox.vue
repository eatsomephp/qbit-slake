<script setup lang="ts">
import { Check, Minus } from '@lucide/vue';
import { CheckboxIndicator, CheckboxRoot, type CheckboxCheckedState } from 'reka-ui';

const checked = defineModel<CheckboxCheckedState>({ default: false });
</script>

<template>
  <CheckboxRoot
    v-model="checked"
    class="peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background shadow-xs dark:data-[state=unchecked]:bg-input/30 transition-colors hover:border-muted-foreground/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
  >
    <CheckboxIndicator class="animate-in duration-100 zoom-in-50">
      <Minus v-if="checked === 'indeterminate'" class="size-3" />
      <Check v-else class="size-3" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
