<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import { useTorrentsStore } from '@/stores/torrents';
import { formatSpeedValue, splitSpeedValueAndUnit } from '@/lib/format';
import ConnectionDot from './ConnectionDot.vue';
import SpeedLimitControl from './SpeedLimitControl.vue';
import SessionPauseToggle from './SessionPauseToggle.vue';

const torrents = useTorrentsStore();

function limitLabel(limit: number) {
  return limit > 0 ? formatSpeedValue(limit) : 'unlimited';
}

const directions = computed(() => {
  const serverState = torrents.serverState;
  return [
    {
      name: 'Download',
      icon: ArrowDown,
      iconColorClass: 'text-chart-download',
      rate: splitSpeedValueAndUnit(serverState.dl_info_speed),
      limit: serverState.dl_rate_limit,
    },
    {
      name: 'Upload',
      icon: ArrowUp,
      iconColorClass: 'text-chart-upload',
      rate: splitSpeedValueAndUnit(serverState.up_info_speed),
      limit: serverState.up_rate_limit,
    },
  ];
});
</script>

<template>
  <nav
    aria-label="Sidebar"
    class="flex h-full w-11 flex-col items-center border-r border-sidebar-border bg-sidebar py-2"
  >
    <ConnectionDot />
    <div
      v-for="direction in directions"
      :key="direction.name"
      v-tooltip:right="
        `${direction.name}: ${direction.rate.value} ${direction.rate.unit}\nLimit: ${limitLabel(direction.limit)}`
      "
      class="mt-3 flex w-full flex-col items-center font-mono text-2xs leading-3.5 tabular-nums"
    >
      <component :is="direction.icon" class="size-3.5" :class="direction.iconColorClass" />
      <span class="sr-only">{{ direction.name }}</span>
      <span class="font-semibold">{{ direction.rate.value }}</span>
      <span class="text-muted-foreground">{{ direction.rate.unit }}</span>
    </div>
    <div class="mt-auto flex flex-col items-center gap-0.5">
      <SessionPauseToggle />
      <SpeedLimitControl orientation="vertical" />
    </div>
  </nav>
</template>
