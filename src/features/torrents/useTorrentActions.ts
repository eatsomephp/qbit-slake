import { reactive } from 'vue';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { requestSync } from '@/sync/useMaindata';
import { useToastsStore } from '@/stores/toasts';
import { useTorrentsStore } from '@/stores/torrents';
import { saveBlob } from '@/lib/saveBlob';
import type { QueueMove, ShareLimits, Torrent } from '@/types/app';

/** Open state for the delete confirmation, shared by the toolbar, menu and keyboard. */
export const deleteRequest = reactive({ open: false, hashes: [] as string[] });

function hashesToFlip(torrents: Torrent[], isOn: (t: Torrent) => boolean, target: boolean) {
  return torrents.filter((t) => isOn(t) !== target).map((t) => t.hash);
}

const MIN_TORRENTS_TO_OFFER_UNDO = 2;

const torrentCount = (count: number) =>
  count === 1 ? '1 torrent' : `${count.toLocaleString()} torrents`;

// Without a gap, Chrome can collapse rapid programmatic downloads and save only some of them.
const GAP_BETWEEN_DOWNLOADS_MS = 200;

export function useTorrentActions() {
  const toasts = useToastsStore();
  const torrents = useTorrentsStore();

  function hashesWhere(matches: (t: Torrent) => boolean) {
    return torrents.all.filter(matches).map((t) => t.hash);
  }

  /**
   * Runs an action, then polls immediately instead of updating the UI optimistically.
   * Resolves true on success; failures become a toast.
   */
  async function perform(label: string, call: () => Promise<void>): Promise<boolean> {
    try {
      await call();
    } catch (err) {
      // 403 is handled globally (back to login).
      if (!(err instanceof QbtHttpError && err.status === 403)) {
        toasts.error(`${label} failed: ${describeQbtError(err)}`);
      }
      return false;
    }
    requestSync();
    return true;
  }

  function onSelection(label: string, hashes: string[], call: () => Promise<void>) {
    return hashes.length ? perform(label, call) : Promise.resolve(false);
  }

  function offerUndo(message: string, label: string, undo: () => Promise<void>) {
    toasts.undoable(message, () => void perform(`Undo ${label.toLowerCase()}`, undo));
  }

  const isBulk = (hashes: string[]) => hashes.length >= MIN_TORRENTS_TO_OFFER_UNDO;

  async function setRunning(
    label: string,
    hashes: string[],
    running: boolean,
    shouldOfferUndo: (flipped: string[]) => boolean,
  ) {
    const flipped = hashes.filter((h) => torrents.get(h)?.isStopped === running);
    const setState = (targets: string[], start: boolean) =>
      start ? qbit.startTorrents(targets) : qbit.stopTorrents(targets);
    const succeeded = await onSelection(label, hashes, () => setState(hashes, running));
    if (succeeded && flipped.length && shouldOfferUndo(flipped)) {
      const verb = running ? 'Started' : 'Stopped';
      offerUndo(`${verb} ${torrentCount(flipped.length)}`, label, () =>
        setState(flipped, !running),
      );
    }
    return succeeded;
  }

  async function toggleFlag(
    label: string,
    hashes: string[],
    enable: boolean,
    toggle: (hashes: string[], enable: boolean) => Promise<void>,
  ) {
    const succeeded = await onSelection(label, hashes, () => toggle(hashes, enable));
    if (succeeded && isBulk(hashes)) {
      const verb = enable ? 'Enabled' : 'Disabled';
      offerUndo(`${verb} ${label.toLowerCase()} for ${torrentCount(hashes.length)}`, label, () =>
        toggle(hashes, !enable),
      );
    }
    return succeeded;
  }

  async function setForceStart(hashes: string[], value: boolean) {
    const affected = hashes.map((h) => torrents.get(h)).filter((t) => t !== undefined);
    const flipped = affected.filter((t) => t.forceStart !== value).map((t) => t.hash);
    const startedFromStopped = value ? affected.filter((t) => t.isStopped).map((t) => t.hash) : [];
    const succeeded = await onSelection('Force start', hashes, () =>
      qbit.setForceStart(hashes, value),
    );
    if (succeeded && isBulk(flipped)) {
      const message = value
        ? `Force started ${torrentCount(flipped.length)}`
        : `Removed force start from ${torrentCount(flipped.length)}`;
      offerUndo(message, 'Force start', async () => {
        await qbit.setForceStart(flipped, !value);
        if (startedFromStopped.length) await qbit.stopTorrents(startedFromStopped);
      });
    }
    return succeeded;
  }

  async function setSessionPaused(paused: boolean) {
    const label = paused ? 'Pause session' : 'Resume session';
    const setPaused = (pause: boolean) => (pause ? qbit.pauseSession() : qbit.resumeSession());
    const succeeded = await perform(label, () => setPaused(paused));
    if (succeeded) {
      offerUndo(paused ? 'Paused all transfers' : 'Resumed all transfers', label, () =>
        setPaused(!paused),
      );
    }
    return succeeded;
  }

  return {
    perform,
    start: (hashes: string[]) => setRunning('Start', hashes, true, isBulk),
    stop: (hashes: string[]) => setRunning('Stop', hashes, false, isBulk),
    startAll: () =>
      setRunning(
        'Start all',
        hashesWhere((t) => t.isStopped),
        true,
        () => true,
      ),
    stopAll: () =>
      setRunning(
        'Stop all',
        hashesWhere((t) => !t.isStopped),
        false,
        () => true,
      ),
    setSessionPaused,
    recheck: (hashes: string[]) =>
      onSelection('Recheck', hashes, () => qbit.recheckTorrents(hashes)),
    reannounce: (hashes: string[]) =>
      onSelection('Reannounce', hashes, () => qbit.reannounceTorrents(hashes)),
    setForceStart,
    setAutoManagement: (hashes: string[], enable: boolean) =>
      onSelection('Automatic torrent management', hashes, () =>
        qbit.setAutoManagement(hashes, enable),
      ),
    setSequentialDownload: (torrents: Torrent[], enable: boolean) =>
      toggleFlag(
        'Sequential download',
        hashesToFlip(torrents, (t) => t.sequentialDownload, enable),
        enable,
        (hashes) => qbit.toggleSequentialDownload(hashes),
      ),
    setFirstLastPiecePrio: (torrents: Torrent[], enable: boolean) =>
      toggleFlag(
        'First and last pieces first',
        hashesToFlip(torrents, (t) => t.firstLastPiecePrio, enable),
        enable,
        (hashes) => qbit.toggleFirstLastPiecePrio(hashes),
      ),
    setSuperSeeding: (torrents: Torrent[], enable: boolean) =>
      toggleFlag(
        'Super seeding',
        hashesToFlip(torrents, (t) => t.superSeeding, enable),
        enable,
        (hashes, value) => qbit.setSuperSeeding(hashes, value),
      ),
    async exportTorrents(torrents: Torrent[]) {
      for (const [index, torrent] of torrents.entries()) {
        if (index > 0)
          await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_DOWNLOADS_MS));
        try {
          saveBlob(await qbit.exportTorrent(torrent.hash), `${torrent.name}.torrent`);
        } catch (err) {
          if (!(err instanceof QbtHttpError && err.status === 403)) {
            toasts.error(`Export of ${torrent.name} failed: ${describeQbtError(err)}`);
          }
        }
      }
    },
    moveInQueue: (hashes: string[], move: QueueMove) =>
      onSelection('Move in queue', hashes, () => qbit.moveInQueue(hashes, move)),
    remove: (hashes: string[], deleteFiles: boolean) =>
      onSelection('Delete', hashes, () => qbit.deleteTorrents(hashes, deleteFiles)),
    setCategory: (hashes: string[], category: string) =>
      onSelection('Set category', hashes, () => qbit.setCategory(hashes, category)),
    addTags: (hashes: string[], tags: string[]) =>
      onSelection('Add tags', hashes, () => qbit.addTags(hashes, tags)),
    removeTags: (hashes: string[], tags: string[]) =>
      onSelection('Remove tags', hashes, () => qbit.removeTags(hashes, tags)),
    setLocation: (hashes: string[], location: string) =>
      onSelection('Move', hashes, () => qbit.setLocation(hashes, location)),
    setDownloadPath: (hashes: string[], path: string) =>
      onSelection('Set incomplete path', hashes, () => qbit.setDownloadPath(hashes, path)),
    setComment: (hashes: string[], comment: string) =>
      onSelection('Edit comment', hashes, () => qbit.setComment(hashes, comment)),
    rename: (hash: string, name: string) => perform('Rename', () => qbit.renameTorrent(hash, name)),
    setSpeedLimits: (hashes: string[], download: number, upload: number) =>
      onSelection('Set speed limits', hashes, async () => {
        await qbit.setDownloadLimit(hashes, download);
        await qbit.setUploadLimit(hashes, upload);
      }),
    setShareLimits: (hashes: string[], limits: ShareLimits) =>
      onSelection('Set share limits', hashes, () => qbit.setShareLimits(hashes, limits)),
    /** Opens the confirmation dialog; deletion only happens from there. */
    confirmDelete(hashes: string[]) {
      if (!hashes.length) return;
      deleteRequest.hashes = hashes;
      deleteRequest.open = true;
    },
  };
}
