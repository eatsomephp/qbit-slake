import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { MetadataLookup, TorrentMetadata } from '@/types/app';
import { useAppStore } from '@/stores/app';

const qbit = vi.hoisted(() => ({
  fetchMetadata: vi.fn(),
  parseMetadata: vi.fn(),
  cancelFetchMetadata: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { useMetadataPreview } = await import('./useMetadataPreview');
const { QbtHttpError } = await import('@/services/qbit');
type PreviewSource = Parameters<typeof useMetadataPreview>[0]['value'];

const metadata = { infoHashV1: 'a'.repeat(40), infoHashV2: '' } as TorrentMetadata;
const link = (value: string, downloader = ''): PreviewSource => ({
  kind: 'link',
  link: value,
  downloader,
});
const pending = (v1 = 'a'.repeat(40), v2 = ''): MetadataLookup =>
  ({ status: 'pending', infoHashV1: v1, infoHashV2: v2 }) as MetadataLookup;
const ready = { status: 'ready', metadata } as MetadataLookup;

let scope: EffectScope;

function setup(initial: PreviewSource | null, canCancel = true) {
  vi.spyOn(useAppStore(), 'isApiAvailable').mockReturnValue(canCancel);
  const source = ref<PreviewSource | null>(initial);
  scope = effectScope();
  const preview = scope.run(() => useMetadataPreview(source))!;
  return { source, preview };
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  qbit.cancelFetchMetadata.mockResolvedValue(undefined);
  setActivePinia(createPinia());
});
afterEach(() => {
  scope?.stop();
  vi.useRealTimers();
});

describe('useMetadataPreview', () => {
  it('stays idle without a source', () => {
    expect(setup(null).preview.state.value).toEqual({ status: 'idle' });
  });

  it('parses a file straight away', async () => {
    qbit.parseMetadata.mockResolvedValue(metadata);
    const file = new File(['x'], 'a.torrent');
    const { preview } = setup({ kind: 'file', file });
    expect(preview.state.value.status).toBe('loading');
    await advance(0);
    expect(qbit.parseMetadata).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(preview.state.value).toMatchObject({ status: 'ready', metadata });
  });

  it('reports a failed file parse', async () => {
    qbit.parseMetadata.mockRejectedValue(new QbtHttpError(400, 'Bad torrent'));
    const { preview } = setup({ kind: 'file', file: new File(['x'], 'a.torrent') });
    await advance(0);
    expect(preview.state.value).toMatchObject({ status: 'failed', reason: 'Bad torrent' });
  });

  it('debounces a link, then polls until the metadata is ready', async () => {
    qbit.fetchMetadata.mockResolvedValueOnce(pending()).mockResolvedValueOnce(ready);
    const { preview } = setup(link('magnet:?xt=urn:btih:a', 'plug'));
    await advance(399);
    expect(qbit.fetchMetadata).not.toHaveBeenCalled();
    await advance(1);
    expect(qbit.fetchMetadata).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:a',
      'plug',
      expect.any(AbortSignal),
    );
    expect(preview.state.value).toMatchObject({ status: 'loading', infoHash: 'a'.repeat(40) });
    await advance(1000);
    expect(preview.state.value).toMatchObject({ status: 'ready', metadata });
    await advance(5000);
    expect(qbit.fetchMetadata).toHaveBeenCalledTimes(2);
  });

  it('shows the v2 hash while loading when there is one', async () => {
    qbit.fetchMetadata.mockResolvedValue(pending('a'.repeat(40), 'b'.repeat(64)));
    const { preview } = setup(link('magnet:?x'));
    await advance(400);
    expect(preview.state.value).toMatchObject({ infoHash: 'b'.repeat(64) });
  });

  it('retries after a network error but fails on an HTTP error', async () => {
    qbit.fetchMetadata.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ready);
    const { preview } = setup(link('magnet:?x'));
    await advance(400);
    expect(preview.state.value.status).toBe('loading');
    await advance(3000);
    expect(preview.state.value.status).toBe('ready');

    qbit.fetchMetadata.mockRejectedValue(new QbtHttpError(404, ''));
    const { preview: failing } = setup(link('magnet:?y'));
    await advance(400);
    expect(failing.state.value).toMatchObject({
      status: 'failed',
      reason: 'qBittorrent responded with 404',
    });
  });

  it('does not report a 403 as a failure', async () => {
    qbit.fetchMetadata.mockRejectedValue(new QbtHttpError(403, ''));
    const { preview } = setup(link('magnet:?x'));
    await advance(400);
    expect(preview.state.value.status).toBe('loading');
  });

  it('cancels the previous lookup and restarts when the source changes', async () => {
    qbit.fetchMetadata.mockResolvedValue(pending());
    const { source, preview } = setup(link('magnet:?one'));
    await advance(400);
    source.value = link('magnet:?two');
    await nextTick();
    expect(qbit.cancelFetchMetadata).toHaveBeenCalledWith('magnet:?one');
    expect(preview.state.value).toMatchObject({ status: 'loading', infoHash: '' });
    await advance(400);
    expect(qbit.fetchMetadata).toHaveBeenLastCalledWith('magnet:?two', '', expect.any(AbortSignal));
  });

  it('does not cancel when the API cannot', async () => {
    qbit.fetchMetadata.mockResolvedValue(pending());
    const { source } = setup(link('magnet:?one'), false);
    await advance(400);
    source.value = null;
    await nextTick();
    expect(qbit.cancelFetchMetadata).not.toHaveBeenCalled();
  });

  it('keeps the lookup after release so a torrents/add can use it', async () => {
    qbit.fetchMetadata.mockResolvedValue(ready);
    const { preview, source } = setup(link('magnet:?one'));
    await advance(400);
    preview.release();
    source.value = null;
    await nextTick();
    expect(qbit.cancelFetchMetadata).not.toHaveBeenCalled();
  });

  it('cancels a pending lookup when the scope is disposed', async () => {
    qbit.fetchMetadata.mockResolvedValue(pending());
    setup(link('magnet:?one'));
    await advance(400);
    scope.stop();
    expect(qbit.cancelFetchMetadata).toHaveBeenCalledWith('magnet:?one');
    await advance(5000);
    expect(qbit.fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('retry restarts the lookup from scratch', async () => {
    qbit.fetchMetadata
      .mockRejectedValueOnce(new QbtHttpError(500, ''))
      .mockResolvedValueOnce(ready);
    const { preview } = setup(link('magnet:?x'));
    await advance(400);
    expect(preview.state.value.status).toBe('failed');
    preview.retry();
    expect(preview.state.value.status).toBe('loading');
    await advance(400);
    expect(preview.state.value.status).toBe('ready');
  });
});
