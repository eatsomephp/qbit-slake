<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue';
import { useElementSize } from '@vueuse/core';
import type { TransferSample } from '@/stores/transfer';
import { buildGraphGeometry } from './transferGraph';

const props = defineProps<{
  samples: readonly TransferSample[];
  heightPx: number;
  inspected: TransferSample | null;
  downloadLimit: number;
  uploadLimit: number;
}>();

const container = useTemplateRef<HTMLDivElement>('container');
const { width } = useElementSize(container);
const gradientIdPrefix = useId();

const geometry = computed(() => buildGraphGeometry(props.samples, width.value, props.heightPx));
const series = computed(() => [
  {
    name: 'upload',
    line: geometry.value.uploadLine,
    area: geometry.value.uploadArea,
    rateOf: (sample: TransferSample) => sample.upload,
    limit: props.uploadLimit,
    color: 'var(--chart-upload)',
    strokeClass: 'stroke-chart-upload',
    fillClass: 'fill-chart-upload',
  },
  {
    name: 'download',
    line: geometry.value.downloadLine,
    area: geometry.value.downloadArea,
    rateOf: (sample: TransferSample) => sample.download,
    limit: props.downloadLimit,
    color: 'var(--chart-download)',
    strokeClass: 'stroke-chart-download',
    fillClass: 'fill-chart-download',
  },
]);
const isCollectingSamples = computed(() => props.samples.length < 2);
const visibleLimits = computed(() =>
  series.value.filter(
    (entry) => entry.limit > 0 && entry.limit <= geometry.value.yScaleMaxBytesPerSec,
  ),
);
</script>

<template>
  <div ref="container" class="relative" :style="{ height: `${heightPx}px` }">
    <Transition name="awaiting-samples">
      <div
        v-if="isCollectingSamples"
        role="status"
        class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted-foreground/15"
      >
        <span class="sr-only">Waiting for the first speed readings</span>
        <span class="awaiting-samples-sweep absolute inset-y-0 left-0 w-2/5" />
      </div>
    </Transition>
    <svg
      v-if="width > 0"
      :width="width"
      :height="heightPx"
      class="block"
      role="img"
      aria-label="Download and upload speed over the last five minutes"
    >
      <defs>
        <linearGradient
          v-for="entry in series"
          :id="`${gradientIdPrefix}-${entry.name}`"
          :key="entry.name"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" :stop-color="entry.color" stop-opacity="0.35" />
          <stop offset="100%" :stop-color="entry.color" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      <line
        v-for="entry in visibleLimits"
        :key="`${entry.name}-limit`"
        x1="0"
        :x2="width"
        :y1="geometry.yOfRate(entry.limit)"
        :y2="geometry.yOfRate(entry.limit)"
        class="opacity-60"
        :class="entry.strokeClass"
        stroke-width="1"
        stroke-dasharray="4 4"
      />
      <path
        v-for="entry in series"
        :key="`${entry.name}-area`"
        :d="entry.area"
        :fill="`url(#${gradientIdPrefix}-${entry.name})`"
      />
      <path
        v-for="entry in series"
        :key="`${entry.name}-line`"
        :d="entry.line"
        class="fill-none"
        :class="entry.strokeClass"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <g v-if="inspected">
        <line
          :x1="geometry.xOfEpochMs(inspected.atEpochMs)"
          :x2="geometry.xOfEpochMs(inspected.atEpochMs)"
          y1="0"
          :y2="heightPx"
          class="stroke-muted-foreground/40"
          stroke-width="1"
        />
        <circle
          v-for="entry in series"
          :key="`${entry.name}-marker`"
          :cx="geometry.xOfEpochMs(inspected.atEpochMs)"
          :cy="geometry.yOfRate(entry.rateOf(inspected))"
          r="4"
          class="stroke-sidebar"
          :class="entry.fillClass"
          stroke-width="2"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.awaiting-samples-sweep {
  background-image: linear-gradient(
    to right,
    transparent,
    var(--chart-download),
    var(--chart-upload),
    transparent
  );
  filter: drop-shadow(0 0 3px var(--chart-download));
  animation: awaiting-samples-sweep 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes awaiting-samples-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

.awaiting-samples-leave-active {
  transition: opacity 300ms ease-out;
}
.awaiting-samples-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .awaiting-samples-sweep {
    animation: none;
    transform: translateX(75%);
  }
}
</style>
