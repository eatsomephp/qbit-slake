import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ShareLimitAction, ShareLimitsMode, TorrentState } from '@/constants/qbit';
import { QbtHttpError } from '@/services/qbit';
import qbit from '@/services/qbit';
import { requestSync } from '@/sync/useMaindata';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { useToastsStore } from '@/stores/toasts';
import { useTorrentsStore } from '@/stores/torrents';
import { saveBlob } from '@/lib/saveBlob';
import type { RawTorrent } from '@/types/qbit';
import { deleteRequest, useTorrentActions } from './useTorrentActions';

vi.mock('@/services/qbit', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/qbit/http')>('@/services/qbit/http');
  const names = [
    'startTorrents',
    'stopTorrents',
    'recheckTorrents',
    'reannounceTorrents',
    'setForceStart',
    'setAutoManagement',
    'toggleSequentialDownload',
    'toggleFirstLastPiecePrio',
    'setSuperSeeding',
    'exportTorrent',
    'moveInQueue',
    'deleteTorrents',
    'setCategory',
    'addTags',
    'removeTags',
    'setLocation',
    'setDownloadPath',
    'setComment',
    'renameTorrent',
    'setDownloadLimit',
    'setUploadLimit',
    'setShareLimits',
    'pauseSession',
    'resumeSession',
  ];
  return {
    QbtHttpError: actual.QbtHttpError,
    describeQbtError: actual.describeQbtError,
    default: Object.fromEntries(names.map((name) => [name, vi.fn()])),
  };
});
vi.mock('@/sync/useMaindata', () => ({ requestSync: vi.fn() }));
vi.mock('@/lib/saveBlob', () => ({ saveBlob: vi.fn() }));

const provider = vi.mocked(qbit);

function seed(torrents: Record<string, Partial<RawTorrent>>) {
  const entries = Object.fromEntries(
    Object.entries(torrents).map(([hash, overrides]) => [
      hash,
      { ...DEFAULT_RAW_TORRENT, name: hash, ...overrides },
    ]),
  );
  useTorrentsStore().apply({ rid: 1, full_update: true, torrents: entries });
}

function toasts() {
  return useToastsStore();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  for (const fn of Object.values(provider))
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  deleteRequest.open = false;
  deleteRequest.hashes = [];
});

describe('perform and error handling', () => {
  it('syncs after success', async () => {
    const actions = useTorrentActions();
    await expect(actions.perform('X', async () => {})).resolves.toBe(true);
    expect(requestSync).toHaveBeenCalledOnce();
  });

  it('toasts the failure with the server message and does not sync', async () => {
    provider.recheckTorrents.mockRejectedValue(new QbtHttpError(409, 'Conflict text'));
    const actions = useTorrentActions();
    await expect(actions.recheck(['a'])).resolves.toBe(false);
    expect(toasts().toasts.map((t) => t.message)).toEqual(['Recheck failed: Conflict text']);
    expect(requestSync).not.toHaveBeenCalled();
  });

  it('stays silent on 403 because login handles it', async () => {
    provider.recheckTorrents.mockRejectedValue(new QbtHttpError(403, ''));
    await expect(useTorrentActions().recheck(['a'])).resolves.toBe(false);
    expect(toasts().toasts).toEqual([]);
  });

  it('does nothing for an empty selection', async () => {
    const actions = useTorrentActions();
    await expect(actions.recheck([])).resolves.toBe(false);
    await expect(actions.setCategory([], 'c')).resolves.toBe(false);
    expect(provider.recheckTorrents).not.toHaveBeenCalled();
    expect(requestSync).not.toHaveBeenCalled();
  });
});

describe('start and stop', () => {
  it('offers no undo when fewer than two torrents changed state', async () => {
    seed({ a: { state: TorrentState.Downloading }, b: { state: TorrentState.StoppedDL } });
    await useTorrentActions().stop(['a', 'b']);
    expect(provider.stopTorrents).toHaveBeenCalledWith(['a', 'b']);
    expect(toasts().toasts).toEqual([]);
  });

  it('offers no undo for a single torrent', async () => {
    seed({ a: { state: TorrentState.StoppedDL } });
    await useTorrentActions().start(['a']);
    expect(provider.startTorrents).toHaveBeenCalledWith(['a']);
    expect(toasts().toasts).toEqual([]);
  });

  it('undoes a bulk start by stopping only the torrents that were stopped', async () => {
    seed({
      a: { state: TorrentState.StoppedDL },
      b: { state: TorrentState.Downloading },
      c: { state: TorrentState.StoppedUP },
    });
    await useTorrentActions().start(['a', 'b', 'c']);
    expect(provider.startTorrents).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(toasts().toasts[0]!.message).toBe('Started 2 torrents');

    toasts().undoLatest();
    await vi.waitFor(() => expect(provider.stopTorrents).toHaveBeenCalledWith(['a', 'c']));
  });

  it('undoes a bulk stop by starting only the running ones', async () => {
    seed({
      a: { state: TorrentState.Downloading },
      b: { state: TorrentState.StoppedDL },
      c: { state: TorrentState.Uploading },
    });
    await useTorrentActions().stop(['a', 'b', 'c']);
    expect(toasts().toasts[0]!.message).toBe('Stopped 2 torrents');
    toasts().undoLatest();
    await vi.waitFor(() => expect(provider.startTorrents).toHaveBeenCalledWith(['a', 'c']));
  });

  it('offers no undo when nothing actually changed state', async () => {
    seed({ a: { state: TorrentState.Downloading }, b: { state: TorrentState.Downloading } });
    await useTorrentActions().start(['a', 'b']);
    expect(toasts().toasts).toEqual([]);
  });

  it('offers no undo when the call failed', async () => {
    seed({ a: { state: TorrentState.StoppedDL }, b: { state: TorrentState.StoppedDL } });
    provider.startTorrents.mockRejectedValue(new Error('x'));
    await useTorrentActions().start(['a', 'b']);
    expect(toasts().toasts.map((t) => t.message)).toEqual(['Start failed: Error: x']);
  });

  it('startAll targets only stopped torrents and always offers undo', async () => {
    seed({ a: { state: TorrentState.StoppedDL }, b: { state: TorrentState.Downloading } });
    await useTorrentActions().startAll();
    expect(provider.startTorrents).toHaveBeenCalledWith(['a']);
    expect(toasts().toasts[0]!.message).toBe('Started 1 torrent');
  });

  it('stopAll targets only non-stopped torrents', async () => {
    seed({ a: { state: TorrentState.StoppedDL }, b: { state: TorrentState.Downloading } });
    await useTorrentActions().stopAll();
    expect(provider.stopTorrents).toHaveBeenCalledWith(['b']);
  });
});

describe('flag toggles', () => {
  const torrentsWith = (flag: boolean) => {
    seed({ a: { seq_dl: flag }, b: { seq_dl: !flag }, c: { seq_dl: flag } });
    const all = useTorrentsStore().all;
    return all;
  };

  it('only toggles torrents not already in the target state', async () => {
    await useTorrentActions().setSequentialDownload(torrentsWith(false), true);
    expect(provider.toggleSequentialDownload).toHaveBeenCalledWith(['a', 'c']);
  });

  it('does not call the API when everything already matches', async () => {
    seed({ a: { seq_dl: true } });
    await expect(
      useTorrentActions().setSequentialDownload([useTorrentsStore().get('a')!], true),
    ).resolves.toBe(false);
    expect(provider.toggleSequentialDownload).not.toHaveBeenCalled();
  });

  it('undoes a bulk toggle with the same toggle endpoint', async () => {
    await useTorrentActions().setFirstLastPiecePrio(torrentsWith(false), true);
    expect(toasts().toasts[0]!.message).toBe('Enabled first and last pieces first for 3 torrents');
    toasts().undoLatest();
    await vi.waitFor(() => expect(provider.toggleFirstLastPiecePrio).toHaveBeenCalledTimes(2));
  });

  it('sets super seeding explicitly and undoes with the inverse value', async () => {
    seed({ a: { super_seeding: false }, b: { super_seeding: false } });
    await useTorrentActions().setSuperSeeding(useTorrentsStore().all, true);
    expect(provider.setSuperSeeding).toHaveBeenCalledWith(['a', 'b'], true);
    toasts().undoLatest();
    await vi.waitFor(() =>
      expect(provider.setSuperSeeding).toHaveBeenLastCalledWith(['a', 'b'], false),
    );
  });
});

describe('setForceStart', () => {
  it('undo restores force start and re-stops torrents that were stopped', async () => {
    seed({
      a: { state: TorrentState.StoppedDL, force_start: false },
      b: { state: TorrentState.Downloading, force_start: false },
      c: { state: TorrentState.Downloading, force_start: true },
    });
    await useTorrentActions().setForceStart(['a', 'b', 'c'], true);
    expect(provider.setForceStart).toHaveBeenCalledWith(['a', 'b', 'c'], true);
    expect(toasts().toasts[0]!.message).toBe('Force started 2 torrents');

    toasts().undoLatest();
    await vi.waitFor(() => expect(provider.stopTorrents).toHaveBeenCalledWith(['a']));
    expect(provider.setForceStart).toHaveBeenLastCalledWith(['a', 'b'], false);
  });

  it('words the removal message and skips stopping when disabling', async () => {
    seed({ a: { force_start: true }, b: { force_start: true } });
    await useTorrentActions().setForceStart(['a', 'b'], false);
    expect(toasts().toasts[0]!.message).toBe('Removed force start from 2 torrents');
    toasts().undoLatest();
    await vi.waitFor(() =>
      expect(provider.setForceStart).toHaveBeenLastCalledWith(['a', 'b'], true),
    );
    expect(provider.stopTorrents).not.toHaveBeenCalled();
  });
});

describe('setSessionPaused', () => {
  it('pauses and offers an undo that resumes', async () => {
    await useTorrentActions().setSessionPaused(true);
    expect(provider.pauseSession).toHaveBeenCalledOnce();
    expect(toasts().toasts[0]!.message).toBe('Paused all transfers');
    toasts().undoLatest();
    await vi.waitFor(() => expect(provider.resumeSession).toHaveBeenCalledOnce());
  });

  it('resumes with a matching message', async () => {
    await useTorrentActions().setSessionPaused(false);
    expect(provider.resumeSession).toHaveBeenCalledOnce();
    expect(toasts().toasts[0]!.message).toBe('Resumed all transfers');
  });
});

describe('simple pass-throughs', () => {
  it('sets speed limits sequentially, download then upload', async () => {
    const order: string[] = [];
    provider.setDownloadLimit.mockImplementation(async () => void order.push('dl'));
    provider.setUploadLimit.mockImplementation(async () => void order.push('ul'));
    await useTorrentActions().setSpeedLimits(['a'], 100, 200);
    expect(order).toEqual(['dl', 'ul']);
    expect(provider.setDownloadLimit).toHaveBeenCalledWith(['a'], 100);
    expect(provider.setUploadLimit).toHaveBeenCalledWith(['a'], 200);
  });

  it('does not set the upload limit when the download limit fails', async () => {
    provider.setDownloadLimit.mockRejectedValue(new Error('x'));
    await expect(useTorrentActions().setSpeedLimits(['a'], 1, 2)).resolves.toBe(false);
    expect(provider.setUploadLimit).not.toHaveBeenCalled();
  });

  it('forwards share limits, deletion and renames', async () => {
    const limits = {
      ratioLimit: 1,
      seedingTimeLimit: 2,
      inactiveSeedingTimeLimit: 3,
      action: ShareLimitAction.Stop,
      mode: ShareLimitsMode.MatchAny,
    };
    const actions = useTorrentActions();
    await actions.setShareLimits(['a'], limits);
    await actions.remove(['a'], true);
    await actions.rename('a', 'new');
    expect(provider.setShareLimits).toHaveBeenCalledWith(['a'], limits);
    expect(provider.deleteTorrents).toHaveBeenCalledWith(['a'], true);
    expect(provider.renameTorrent).toHaveBeenCalledWith('a', 'new');
  });
});

describe('exportTorrents', () => {
  it('saves each torrent as <name>.torrent', async () => {
    const blob = new Blob(['x']);
    provider.exportTorrent.mockResolvedValue(blob);
    seed({ a: { name: 'one' } });
    await useTorrentActions().exportTorrents(useTorrentsStore().all);
    expect(saveBlob).toHaveBeenCalledWith(blob, 'one.torrent');
  });

  it('continues past a failed export after toasting it, and spaces downloads apart', async () => {
    vi.useFakeTimers();
    try {
      seed({ a: { name: 'one' }, b: { name: 'two' } });
      provider.exportTorrent.mockRejectedValueOnce(new QbtHttpError(404, 'gone'));
      provider.exportTorrent.mockResolvedValueOnce(new Blob(['x']));
      const done = useTorrentActions().exportTorrents(useTorrentsStore().all);
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.exportTorrent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await done;
      expect(provider.exportTorrent).toHaveBeenCalledTimes(2);
      expect(saveBlob).toHaveBeenCalledTimes(1);
      expect(toasts().toasts[0]!.message).toBe('Export of one failed: gone');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('confirmDelete', () => {
  it('opens the shared dialog request', () => {
    useTorrentActions().confirmDelete(['a', 'b']);
    expect(deleteRequest).toMatchObject({ open: true, hashes: ['a', 'b'] });
  });

  it('ignores an empty selection', () => {
    useTorrentActions().confirmDelete([]);
    expect(deleteRequest.open).toBe(false);
  });
});
