import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import type { TorrentMetadata } from '@/types/app';

export type PreviewSource =
  { kind: 'link'; link: string; downloader: string } | { kind: 'file'; file: File };

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading'; source: PreviewSource; infoHash: string }
  | { status: 'ready'; source: PreviewSource; metadata: TorrentMetadata }
  | { status: 'failed'; source: PreviewSource; reason: string };

const TYPING_DEBOUNCE_MS = 400;
const POLL_MS = 1000;
const RETRY_AFTER_NETWORK_ERROR_MS = 3000;

const sourceKey = (source: PreviewSource | null) =>
  !source
    ? null
    : source.kind === 'link'
      ? `link:${source.downloader}:${source.link}`
      : `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`;

/** Looks up a single add source's metadata while it's queued in the add dialog. */
export function useMetadataPreview(source: Ref<PreviewSource | null>) {
  const canCancel = useAppStore().isApiAvailable(API.cancelFetchMetadata);
  const state = shallowRef<PreviewState>({ status: 'idle' });
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lookupToCancel: string | null = null;

  function stop() {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
  }

  function abandon() {
    stop();
    if (lookupToCancel && canCancel) qbit.cancelFetchMetadata(lookupToCancel).catch(() => {});
    lookupToCancel = null;
  }

  /** After torrents/add has used the metadata: there's nothing left to cancel. */
  function release() {
    stop();
    lookupToCancel = null;
  }

  function fail(current: PreviewSource, err: unknown) {
    if (err instanceof QbtHttpError && err.status === 403) return;
    state.value = { status: 'failed', source: current, reason: describeQbtError(err) };
  }

  async function pollLink(current: PreviewSource & { kind: 'link' }, signal: AbortSignal) {
    try {
      const lookup = await qbit.fetchMetadata(current.link, current.downloader, signal);
      if (signal.aborted) return;
      if (lookup.status === 'ready') {
        state.value = { status: 'ready', source: current, metadata: lookup.metadata };
        return;
      }
      state.value = {
        status: 'loading',
        source: current,
        infoHash: lookup.infoHashV2 || lookup.infoHashV1,
      };
      timer = setTimeout(() => void pollLink(current, signal), POLL_MS);
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof QbtHttpError) fail(current, err);
      else timer = setTimeout(() => void pollLink(current, signal), RETRY_AFTER_NETWORK_ERROR_MS);
    }
  }

  async function parseFile(current: PreviewSource & { kind: 'file' }, signal: AbortSignal) {
    try {
      const metadata = await qbit.parseMetadata(current.file, signal);
      if (!signal.aborted) state.value = { status: 'ready', source: current, metadata };
    } catch (err) {
      if (!signal.aborted) fail(current, err);
    }
  }

  function start(current: PreviewSource | null) {
    abandon();
    if (!current) {
      state.value = { status: 'idle' };
      return;
    }
    state.value = { status: 'loading', source: current, infoHash: '' };
    const { signal } = (controller = new AbortController());
    if (current.kind === 'file') {
      void parseFile(current, signal);
      return;
    }
    lookupToCancel = current.link;
    timer = setTimeout(() => void pollLink(current, signal), TYPING_DEBOUNCE_MS);
  }

  function retry() {
    start(source.value);
  }

  watch(
    () => sourceKey(source.value),
    () => start(source.value),
    { immediate: true },
  );
  onScopeDispose(abandon);

  return { state, release, retry };
}
