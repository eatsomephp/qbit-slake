import type { Component } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CirclePause,
  Clock,
  FolderInput,
  Magnet,
  LoaderCircle,
} from '@lucide/vue';
import { TorrentState } from '@/constants/qbit';
import type { Torrent } from '@/types/app';

const LABELS: Record<TorrentState, string> = {
  [TorrentState.Error]: 'Error',
  [TorrentState.MissingFiles]: 'Missing files',
  [TorrentState.Uploading]: 'Seeding',
  [TorrentState.StoppedUP]: 'Completed',
  [TorrentState.QueuedUP]: 'Queued',
  [TorrentState.StalledUP]: 'Seeding',
  [TorrentState.CheckingUP]: 'Checking',
  [TorrentState.ForcedUP]: 'Seeding',
  [TorrentState.Allocating]: 'Allocating',
  [TorrentState.Downloading]: 'Downloading',
  [TorrentState.MetaDL]: 'Metadata',
  [TorrentState.ForcedMetaDL]: 'Metadata',
  [TorrentState.StoppedDL]: 'Stopped',
  [TorrentState.QueuedDL]: 'Queued',
  [TorrentState.StalledDL]: 'Stalled',
  [TorrentState.CheckingDL]: 'Checking',
  [TorrentState.ForcedDL]: 'Downloading',
  [TorrentState.CheckingResumeData]: 'Checking',
  [TorrentState.Moving]: 'Moving',
  [TorrentState.Unknown]: 'Unknown',
};

const FORCED_STATES = new Set<TorrentState>([
  TorrentState.ForcedUP,
  TorrentState.ForcedDL,
  TorrentState.ForcedMetaDL,
]);

const QUEUED_STATES = new Set<TorrentState>([TorrentState.QueuedDL, TorrentState.QueuedUP]);

export function stateLabel(t: Pick<Torrent, 'state'>): string {
  return LABELS[t.state] ?? t.state;
}

export function isForced(t: Pick<Torrent, 'state'>): boolean {
  return FORCED_STATES.has(t.state);
}

export function queuePosition(t: Pick<Torrent, 'state' | 'priority'>): number | null {
  return QUEUED_STATES.has(t.state) && t.priority > 0 ? t.priority : null;
}

export type StateTone = 'down' | 'up' | 'idle' | 'error' | 'muted' | 'checking';

/** Coarse color group for the progress bar. */
export function stateTone(t: Torrent): StateTone {
  if (t.isErrored) return 'error';
  if (t.isChecking) return 'checking';
  if (t.isStopped) return 'muted';
  if (t.isComplete) return t.upspeed > 0 ? 'up' : 'idle';
  return t.dlspeed > 0 ? 'down' : 'idle';
}

export type StatusTone = 'down' | 'up' | 'done' | 'idle' | 'busy' | 'error';

export interface StatusDisplay {
  icon: Component;
  tone: StatusTone;
  spinning?: boolean;
}

export function statusDisplay(t: Torrent): StatusDisplay {
  if (t.isErrored) return { icon: CircleAlert, tone: 'error' };
  switch (t.state) {
    case TorrentState.Downloading:
    case TorrentState.ForcedDL:
      return { icon: ArrowDown, tone: t.dlspeed > 0 ? 'down' : 'idle' };
    case TorrentState.StalledDL:
      return { icon: ArrowDown, tone: 'idle' };
    case TorrentState.MetaDL:
    case TorrentState.ForcedMetaDL:
      return { icon: Magnet, tone: 'down' };
    case TorrentState.Uploading:
    case TorrentState.ForcedUP:
    case TorrentState.StalledUP:
      return { icon: ArrowUp, tone: t.upspeed > 0 ? 'up' : 'idle' };
    case TorrentState.StoppedUP:
      return { icon: CircleCheck, tone: 'done' };
    case TorrentState.StoppedDL:
      return { icon: CirclePause, tone: 'idle' };
    case TorrentState.QueuedDL:
    case TorrentState.QueuedUP:
      return { icon: Clock, tone: 'idle' };
    case TorrentState.CheckingDL:
    case TorrentState.CheckingUP:
    case TorrentState.CheckingResumeData:
    case TorrentState.Allocating:
      return { icon: LoaderCircle, tone: 'busy', spinning: true };
    case TorrentState.Moving:
      return { icon: FolderInput, tone: 'busy' };
    default:
      return { icon: CircleHelp, tone: 'idle' };
  }
}

export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  down: 'text-chart-download',
  up: 'text-chart-upload',
  done: 'text-success',
  idle: 'text-muted-foreground',
  busy: 'text-warning',
  error: 'text-destructive',
};

export function statusIconClass(status: StatusDisplay): string {
  const tone = STATUS_TONE_TEXT[status.tone];
  return status.spinning ? `${tone} status-icon-spin` : tone;
}
