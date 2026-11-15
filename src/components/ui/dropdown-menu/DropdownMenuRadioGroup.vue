<script setup lang="ts">
import { DropdownMenuRadioGroup } from 'reka-ui';

const model = defineModel<string>({ required: true });
</script>

<template>
  <DropdownMenuRadioGroup v-model="model">
    <slot />
  </DropdownMenuRadioGroup>
</template>
