import type { Torrent } from '@/types/app';
import type { StateTone } from './state';
import { formatSpeed, formatSpeedValue } from '@/lib/format';
import { labelHue } from '@/lib/labelHue';

export function nameClass(t: Torrent): string {
  if (t.isErrored) return 'text-destructive';
  if (t.isStopped) return 'text-muted-foreground';
  return '';
}

export function labelChipStyle(label: string) {
  return { '--label-hue': labelHue(label) };
}

export const PROGRESS_BAR_TONE: Record<StateTone, string> = {
  down: 'progress-fill progress-down',
  up: 'progress-fill progress-up',
  idle: 'progress-fill progress-idle',
  error: 'progress-fill progress-error',
  muted: 'progress-fill progress-muted',
  checking: 'progress-fill progress-checking',
};

const MAX_INLINE_TAGS = 2;

export function inlineTags(tags: readonly string[]) {
  return {
    shown: tags.slice(0, MAX_INLINE_TAGS),
    hiddenCount: Math.max(0, tags.length - MAX_INLINE_TAGS),
  };
}

export function speedLimitHint(limitBytesPerSec: number, direction: 'Download' | 'Upload') {
  return limitBytesPerSec > 0 ? `${direction} limit: ${formatSpeed(limitBytesPerSec)}` : '';
}

export function speedText(bytesPerSec: number, limitBytesPerSec: number) {
  return formatSpeed(bytesPerSec) || (limitBytesPerSec > 0 ? formatSpeedValue(0) : '');
}
