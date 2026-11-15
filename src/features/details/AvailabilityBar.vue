<script setup lang="ts">
import { AVAILABILITY_STEPS, availabilityColumns, runs } from './pieces';
import { themeColor, useBarCanvas } from './useBarCanvas';

const BAR_HEIGHT = 4;

const props = defineProps<{ counts: readonly number[] }>();

const { wrap, canvas } = useBarCanvas(BAR_HEIGHT, (ctx, cssWidth) => {
  ctx.fillStyle = themeColor('--primary');
  for (const run of runs(availabilityColumns(props.counts, cssWidth))) {
    if (run.value === 0) continue;
    ctx.globalAlpha = run.value / AVAILABILITY_STEPS;
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
    <canvas ref="canvas" class="block size-full" />
  </div>
</template>
