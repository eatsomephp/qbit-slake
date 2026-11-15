import { onScopeDispose, shallowRef, watch } from 'vue';
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
import { QbtHttpError } from '@/services/qbit';
import { useUiStore } from '@/stores/ui';

/** Entries kept client-side; older ones are dropped. */
export const MAX_ENTRIES = 5000;

interface LogEntry {
  id: number;
}

/** Appends new entries, de-duplicating by id and capping the length. Pure. */
export function appendEntries<Entry extends LogEntry>(
  current: readonly Entry[],
  incoming: readonly Entry[],
  max = MAX_ENTRIES,
): Entry[] {
  const lastId = current.at(-1)?.id ?? -1;
  const fresh = incoming.filter((e) => e.id > lastId);
  if (!fresh.length) return current as Entry[];
  const next = current.concat(fresh);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Polls a log endpoint incrementally with last_known_id while `isActive` holds. */
export function useLog<Entry extends LogEntry>(
  fetchSince: (lastKnownId: number, signal: AbortSignal) => Promise<Entry[]>,
  isActive: () => boolean,
) {
  const ui = useUiStore();
  const visibility = useDocumentVisibility();
  const entries = shallowRef<Entry[]>([]);
  const error = shallowRef<string | null>(null);
  let inFlight: AbortController | null = null;

  async function poll() {
    if (inFlight || visibility.value === 'hidden' || !isActive()) return;
    const controller = new AbortController();
    inFlight = controller;
    try {
      const lastId = entries.value.at(-1)?.id ?? -1;
      const incoming = await fetchSince(lastId, controller.signal);
      entries.value = appendEntries(entries.value, incoming);
      error.value = null;
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!(err instanceof QbtHttpError && err.status === 403))
        error.value = "Couldn't load the log.";
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  }

  useIntervalFn(poll, () => ui.refreshInterval, { immediateCallback: true });
  watch(isActive, (active) => active && poll());
  onScopeDispose(() => inFlight?.abort());

  return { entries, error, poll };
}
