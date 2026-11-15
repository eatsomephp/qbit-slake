import { describe, expect, it } from 'vitest';
import { CircleAlert, CircleCheck, CircleHelp, LoaderCircle } from '@lucide/vue';
import { TorrentState } from '@/constants/qbit';
import { createTorrent, DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import type { RawTorrent } from '@/types/qbit';
import {
  STATUS_TONE_TEXT,
  isForced,
  queuePosition,
  stateLabel,
  stateTone,
  statusDisplay,
  statusIconClass,
} from './state';

const torrent = (overrides: Partial<RawTorrent>) =>
  createTorrent('h', { ...DEFAULT_RAW_TORRENT, ...overrides });

describe('stateLabel', () => {
  it('labels every known state', () => {
    for (const state of Object.values(TorrentState)) expect(stateLabel({ state })).toBeTruthy();
  });

  it('shows seeding for all upload states and falls back to the raw value for unknown ones', () => {
    expect(stateLabel({ state: TorrentState.StalledUP })).toBe('Seeding');
    expect(stateLabel({ state: TorrentState.StoppedUP })).toBe('Completed');
    expect(stateLabel({ state: 'futureState' as TorrentState })).toBe('futureState');
  });
});

describe('isForced', () => {
  it('is true only for forced states', () => {
    expect(isForced({ state: TorrentState.ForcedMetaDL })).toBe(true);
    expect(isForced({ state: TorrentState.Downloading })).toBe(false);
  });
});

describe('queuePosition', () => {
  it('returns the priority only for queued torrents with a positive priority', () => {
    expect(queuePosition({ state: TorrentState.QueuedDL, priority: 3 })).toBe(3);
    expect(queuePosition({ state: TorrentState.QueuedUP, priority: 0 })).toBeNull();
    expect(queuePosition({ state: TorrentState.Downloading, priority: 3 })).toBeNull();
  });
});

describe('stateTone', () => {
  it('ranks error above checking above stopped', () => {
    expect(stateTone(torrent({ state: TorrentState.Error }))).toBe('error');
    expect(stateTone(torrent({ state: TorrentState.CheckingUP }))).toBe('checking');
    expect(stateTone(torrent({ state: TorrentState.StoppedDL }))).toBe('muted');
  });

  it('picks direction from speed and completion', () => {
    expect(stateTone(torrent({ progress: 1, upspeed: 1 }))).toBe('up');
    expect(stateTone(torrent({ progress: 1 }))).toBe('idle');
    expect(stateTone(torrent({ progress: 0.5, dlspeed: 1 }))).toBe('down');
    expect(stateTone(torrent({ progress: 0.5 }))).toBe('idle');
  });
});

describe('statusDisplay', () => {
  it('reports errors for errored states', () => {
    expect(statusDisplay(torrent({ state: TorrentState.MissingFiles }))).toEqual({
      icon: CircleAlert,
      tone: 'error',
    });
  });

  it('tones transfers by actual speed', () => {
    expect(statusDisplay(torrent({ state: TorrentState.Downloading, dlspeed: 5 })).tone).toBe(
      'down',
    );
    expect(statusDisplay(torrent({ state: TorrentState.Downloading })).tone).toBe('idle');
    expect(statusDisplay(torrent({ state: TorrentState.Uploading, upspeed: 5 })).tone).toBe('up');
    expect(statusDisplay(torrent({ state: TorrentState.StalledUP })).tone).toBe('idle');
  });

  it('marks completed, busy and unknown states', () => {
    expect(statusDisplay(torrent({ state: TorrentState.StoppedUP }))).toEqual({
      icon: CircleCheck,
      tone: 'done',
    });
    expect(statusDisplay(torrent({ state: TorrentState.Allocating }))).toEqual({
      icon: LoaderCircle,
      tone: 'busy',
      spinning: true,
    });
    expect(statusDisplay(torrent({ state: TorrentState.Unknown })).icon).toBe(CircleHelp);
  });
});

describe('statusIconClass', () => {
  it('adds the spin class only for spinning statuses', () => {
    expect(statusIconClass({ icon: CircleHelp, tone: 'busy', spinning: true })).toBe(
      `${STATUS_TONE_TEXT.busy} status-icon-spin`,
    );
    expect(statusIconClass({ icon: CircleHelp, tone: 'done' })).toBe(STATUS_TONE_TEXT.done);
  });
});
