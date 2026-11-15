<script setup lang="ts">
import { computed } from 'vue';
import { Kbd } from '@/components/ui/kbd';
import { useIsMobile } from '@/composables/useIsMobile';
import { shortcutLabel } from './engine';

const props = defineProps<{ keys: string }>();

const isMobile = useIsMobile();
const label = computed(() => (isMobile.value ? null : shortcutLabel(props.keys)));
</script>

<template>
  <Kbd v-if="label" aria-hidden="true" class="ml-auto pl-1.5">{{ label }}</Kbd>
</template>
