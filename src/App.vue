<script setup lang="ts">
import { RouterView } from 'vue-router';
import Toaster from '@/components/ui/toast/Toaster.vue';
import TooltipLayer from '@/components/tooltip/TooltipLayer.vue';
import { useTheme } from '@/composables/useTheme';

useTheme();
</script>

<template>
  <RouterView />
  <Toaster />
  <TooltipLayer />
</template>
