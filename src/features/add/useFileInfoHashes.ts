import { onScopeDispose, shallowReactive, watch, type Ref } from 'vue';
import qbit from '@/services/qbit';
import { fileKey } from './addState';

/**
 * Info hashes of queued .torrent files, keyed by `fileKey`, so duplicates are known before adding.
 * Files are parsed one per request: 5.3 and older key parseMetadata uploads by file name.
 */
export function useFileInfoHashes(files: Ref<readonly File[]>, enabled: Ref<boolean>) {
  const hashesByFile = shallowReactive(new Map<string, string[]>());
  const requested = new Set<string>();
  let controller = new AbortController();

  async function parseMissing() {
    const { signal } = controller;
    for (const file of files.value) {
      const key = fileKey(file);
      if (requested.has(key)) continue;
      requested.add(key);
      try {
        const metadata = await qbit.parseMetadata(file, signal);
        hashesByFile.set(key, [metadata.infoHashV1, metadata.infoHashV2].filter(Boolean));
      } catch {
        if (signal.aborted) requested.delete(key);
      }
      if (signal.aborted) return;
    }
  }

  function reset() {
    controller.abort();
    controller = new AbortController();
    requested.clear();
    hashesByFile.clear();
  }

  watch(
    [() => files.value.map(fileKey).join('\n'), enabled],
    ([keys, isEnabled]) => {
      if (!keys) reset();
      else if (isEnabled) void parseMissing();
    },
    { immediate: true },
  );
  onScopeDispose(() => controller.abort());

  return hashesByFile;
}
