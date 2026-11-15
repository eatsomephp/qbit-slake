import { useStorage } from '@vueuse/core';

export type RatioColors = 'off' | 'low' | 'scale';

// Read inside ratioClass so every computed and render that colors a ratio tracks it.
export const ratioColors = useStorage<RatioColors>('slake:ratioColors', 'low');

export function ratioClass(ratio: number): string {
  if (ratio < 0) return 'text-muted-foreground';
  if (ratioColors.value === 'off') return '';
  const shown = Math.round(ratio * 100) / 100;
  if (shown < 0.5) return 'text-destructive';
  if (shown < 1) return 'text-warning';
  if (ratioColors.value === 'low') return '';
  if (shown < 5) return 'text-success';
  return 'text-chart-download';
}
