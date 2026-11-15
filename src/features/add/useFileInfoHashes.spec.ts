import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import type { TorrentMetadata } from '@/types/app';

const qbit = vi.hoisted(() => ({ parseMetadata: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { useFileInfoHashes } = await import('./useFileInfoHashes');
const { fileKey } = await import('./addState');

const file = (name: string, size = 1) => new File(['x'.repeat(size)], name);
const metadata = (v1: string, v2 = '') => ({ infoHashV1: v1, infoHashV2: v2 }) as TorrentMetadata;

function setup(initial: File[], enabled = true) {
  const files = ref<File[]>(initial);
  const isEnabled = ref(enabled);
  const scope = effectScope();
  const hashes = scope.run(() => useFileInfoHashes(files, isEnabled))!;
  return { files, isEnabled, hashes, scope };
}

beforeEach(() => vi.resetAllMocks());

describe('useFileInfoHashes', () => {
  it('parses each queued file separately and collects the non-empty hashes', async () => {
    qbit.parseMetadata.mockResolvedValueOnce(metadata('a'.repeat(40), 'b'.repeat(64)));
    qbit.parseMetadata.mockResolvedValueOnce(metadata('c'.repeat(40)));
    const a = file('a.torrent');
    const b = file('b.torrent');
    const { hashes } = setup([a, b]);
    await flushPromises();
    expect(qbit.parseMetadata).toHaveBeenCalledTimes(2);
    expect(hashes.get(fileKey(a))).toEqual(['a'.repeat(40), 'b'.repeat(64)]);
    expect(hashes.get(fileKey(b))).toEqual(['c'.repeat(40)]);
  });

  it('waits until enabled', async () => {
    qbit.parseMetadata.mockResolvedValue(metadata('a'.repeat(40)));
    const { isEnabled } = setup([file('a.torrent')], false);
    await flushPromises();
    expect(qbit.parseMetadata).not.toHaveBeenCalled();
    isEnabled.value = true;
    await flushPromises();
    expect(qbit.parseMetadata).toHaveBeenCalledTimes(1);
  });

  it('only parses files it has not seen', async () => {
    qbit.parseMetadata.mockResolvedValue(metadata('a'.repeat(40)));
    const { files } = setup([file('a.torrent')]);
    await flushPromises();
    files.value = [...files.value, file('b.torrent')];
    await flushPromises();
    expect(qbit.parseMetadata).toHaveBeenCalledTimes(2);
  });

  it('does not retry a file whose parse failed', async () => {
    qbit.parseMetadata.mockRejectedValue(new Error('bad'));
    const { files, hashes } = setup([file('a.torrent')]);
    await flushPromises();
    files.value = [...files.value, file('b.torrent')];
    await flushPromises();
    expect(qbit.parseMetadata).toHaveBeenCalledTimes(2);
    expect(hashes.size).toBe(0);
  });

  it('clears results when the queue empties and parses again when refilled', async () => {
    qbit.parseMetadata.mockResolvedValue(metadata('a'.repeat(40)));
    const a = file('a.torrent');
    const { files, hashes } = setup([a]);
    await flushPromises();
    expect(hashes.size).toBe(1);
    files.value = [];
    await nextTick();
    expect(hashes.size).toBe(0);
    files.value = [a];
    await flushPromises();
    expect(qbit.parseMetadata).toHaveBeenCalledTimes(2);
    expect(hashes.size).toBe(1);
  });

  it('aborts in-flight parsing when the scope is disposed', async () => {
    let signal: AbortSignal | undefined;
    qbit.parseMetadata.mockImplementation((_file: File, s: AbortSignal) => {
      signal = s;
      return new Promise(() => {});
    });
    const { scope } = setup([file('a.torrent')]);
    await flushPromises();
    expect(signal!.aborted).toBe(false);
    scope.stop();
    expect(signal!.aborted).toBe(true);
  });
});
