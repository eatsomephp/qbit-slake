<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref } from 'vue';
import { ArrowDown, ArrowUp, Snail } from '@lucide/vue';
import { useTorrentsStore } from '@/stores/torrents';
import { useTransferStore } from '@/stores/transfer';
import { formatBytes, formatSpeedValue, splitSpeedValueAndUnit } from '@/lib/format';
import TransferGraph from './TransferGraph.vue';
import { epochMsAtFraction, interpolatedSampleAt, timeDomainOf } from './transferGraph';

const torrents = useTorrentsStore();
const transfer = useTransferStore();

const inspectedFraction = ref<number | null>(null);
const inspectedSample = computed(() =>
  inspectedFraction.value === null || transfer.samples.length < 2
    ? null
    : interpolatedSampleAt(
        transfer.samples,
        epochMsAtFraction(timeDomainOf(transfer.samples), inspectedFraction.value),
      ),
);

function inspectAt(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  inspectedFraction.value = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : null;
}

const serverState = computed(() => torrents.serverState);
const directions = computed(() => [
  {
    name: 'Download',
    icon: ArrowDown,
    iconColorClass: 'text-chart-download',
    rate: splitSpeedValueAndUnit(
      inspectedSample.value?.download ?? serverState.value.dl_info_speed,
    ),
    sessionTotal: serverState.value.dl_info_data,
    allTimeTotal: serverState.value.alltime_dl,
    limit: serverState.value.dl_rate_limit,
  },
  {
    name: 'Upload',
    icon: ArrowUp,
    iconColorClass: 'text-chart-upload',
    rate: splitSpeedValueAndUnit(inspectedSample.value?.upload ?? serverState.value.up_info_speed),
    sessionTotal: serverState.value.up_info_data,
    allTimeTotal: serverState.value.alltime_ul,
    limit: serverState.value.up_rate_limit,
  },
]);
const isEitherDirectionCapped = computed(() => directions.value.some(({ limit }) => limit > 0));
</script>

<template>
  <section
    aria-label="Transfer"
    class="touch-none"
    :class="torrents.connection === 'connected' && 'cursor-crosshair'"
    @pointermove="inspectAt"
    @pointerdown="inspectAt"
    @pointerleave="inspectedFraction = null"
  >
    <div class="grid grid-cols-2 gap-2 px-4 pt-3 pb-1">
      <div v-for="direction in directions" :key="direction.name" class="min-w-0">
        <div class="flex items-baseline gap-1">
          <component
            :is="direction.icon"
            class="size-4 shrink-0 self-center"
            :class="direction.iconColorClass"
          />
          <span class="sr-only">{{ direction.name }}</span>
          <span class="truncate text-xl leading-6 font-semibold tracking-tight tabular-nums">
            {{ direction.rate.value }}
          </span>
          <span class="shrink-0 text-2xs text-muted-foreground">{{ direction.rate.unit }}</span>
        </div>
        <div class="pl-5 font-mono text-2xs leading-5 text-muted-foreground tabular-nums">
          <div
            v-tooltip="
              `This session: ${formatBytes(direction.sessionTotal)}\nAll time: ${formatBytes(direction.allTimeTotal)}`
            "
            class="w-fit max-w-full truncate"
          >
            {{ formatBytes(direction.sessionTotal) }}
          </div>
          <span
            v-if="direction.limit > 0"
            v-tooltip="
              `${direction.name} limit${serverState.use_alt_speed_limits ? ' (alternative)' : ''}`
            "
            class="flex w-fit items-center gap-0.5 rounded bg-sidebar-accent px-1 leading-4 whitespace-nowrap"
            :class="serverState.use_alt_speed_limits && 'text-primary'"
            :aria-label="`${direction.name} limit: ${formatSpeedValue(direction.limit)}`"
          >
            <Snail v-if="serverState.use_alt_speed_limits" class="size-3" />
            {{ formatSpeedValue(direction.limit) }}
          </span>
          <div v-else-if="isEitherDirectionCapped" class="h-4" />
        </div>
      </div>
    </div>
    <TransferGraph
      v-if="torrents.connection === 'connected'"
      :samples="transfer.samples"
      :inspected="inspectedSample"
      :download-limit="serverState.dl_rate_limit"
      :upload-limit="serverState.up_rate_limit"
      :height-px="72"
    />
  </section>
</template>
