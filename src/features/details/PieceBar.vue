<script setup lang="ts">
import { Column, pieceColumns, runs } from './pieces';
import { themeColor, useBarCanvas } from './useBarCanvas';

const BAR_HEIGHT = 8;
const PARTIAL_ALPHA = 0.45;

const props = defineProps<{ states: readonly number[] | undefined; isComplete: boolean }>();

const { wrap, canvas } = useBarCanvas(BAR_HEIGHT, (ctx, cssWidth) => {
  const states = props.states;
  if (!states?.length) return;
  // Theme colors are read at draw time so a light/dark switch applies on the next poll.
  const fill: Record<number, string> = {
    [Column.Missing]: themeColor('--muted'),
    [Column.Downloading]: themeColor('--warning'),
    [Column.Downloaded]: themeColor('--chart-download'),
    [Column.Partial]: themeColor('--chart-download'),
  };
  for (const run of runs(pieceColumns(states, cssWidth))) {
    ctx.globalAlpha = run.value === Column.Partial ? PARTIAL_ALPHA : 1;
    ctx.fillStyle = fill[run.value]!;
    ctx.fillRect(run.start, 0, run.length, BAR_HEIGHT);
  }
});
</script>

<template>
  <div
    ref="wrap"
    class="overflow-hidden rounded-full bg-muted"
    :style="{ height: `${BAR_HEIGHT}px` }"
  >
    <div v-if="isComplete && !states?.length" class="progress-fill progress-down size-full" />
    <canvas v-else-if="states?.length" ref="canvas" class="block size-full" />
  </div>
</template>
