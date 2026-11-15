// maindata poll loop: one request in flight, setTimeout chaining, visibility pause,
// exponential backoff on failure, stop on 403.

import { onScopeDispose, watch } from 'vue';
import { useDocumentVisibility } from '@vueuse/core';
import qbit, { QbtHttpError } from '@/services/qbit';
import type { MaindataResponse } from '@/types/qbit';
import { useTorrentsStore, type ConnectionState } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';

export const MAX_BACKOFF_MS = 10_000;
/** Hidden longer than this → poll immediately when the tab becomes visible again. */
export const STALE_AFTER_HIDDEN_MS = 3_000;

export interface PollerDeps<T extends { rid: number } = MaindataResponse> {
  fetch(rid: number, signal: AbortSignal): Promise<T>;
  onData(data: T): void;
  onStatus(status: ConnectionState): void;
  onUnauthorized(): void;
  interval(): number;
  now?: () => number;
}

export interface Poller {
  start(): void;
  stop(): void;
  /** Poll as soon as possible (after the in-flight request, if any). */
  pollNow(): void;
  setVisible(visible: boolean): void;
  readonly rid: number;
}

export function createPoller<T extends { rid: number }>(deps: PollerDeps<T>): Poller {
  const now = deps.now ?? Date.now;
  let rid = 0;
  let running = false;
  let visible = true;
  let hiddenAt = 0;
  let inFlight: AbortController | null = null;
  let pending = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(ms: number) {
    clearTimeout(timer);
    timer = undefined;
    if (!running || !visible) return;
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    timer = undefined;
    if (!running || !visible || inFlight) return;
    const controller = new AbortController();
    inFlight = controller;
    pending = false;
    let next: number;
    try {
      const data = await deps.fetch(rid, controller.signal);
      if (controller.signal.aborted) return;
      rid = data.rid;
      deps.onData(data);
      failures = 0;
      deps.onStatus('connected');
      next = deps.interval();
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof QbtHttpError && err.status === 403) {
        stop();
        deps.onUnauthorized();
        return;
      }
      failures++;
      deps.onStatus('disconnected');
      next = Math.min(deps.interval() * 2 ** failures, MAX_BACKOFF_MS);
    } finally {
      if (inFlight === controller) inFlight = null;
    }
    schedule(pending ? 0 : next);
  }

  function start() {
    if (running) return;
    running = true;
    rid = 0;
    failures = 0;
    schedule(0);
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    timer = undefined;
    inFlight?.abort();
    inFlight = null;
  }

  function pollNow() {
    if (inFlight) pending = true;
    else schedule(0);
  }

  function setVisible(value: boolean) {
    if (value === visible) return;
    visible = value;
    if (!visible) {
      hiddenAt = now();
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    if (inFlight) return;
    schedule(now() - hiddenAt > STALE_AFTER_HIDDEN_MS ? 0 : deps.interval());
  }

  return {
    start,
    stop,
    pollNow,
    setVisible,
    get rid() {
      return rid;
    },
  };
}

let active: Poller | null = null;

/** Ask the running sync loop to refresh now, e.g. right after a user action. */
export function requestSync() {
  active?.pollNow();
}

/**
 * Runs the maindata loop for the lifetime of the calling component's scope.
 * `onUnauthorized` fires on 403 (the global qbt:unauthorized event also fires).
 */
export function useMaindata(onUnauthorized: () => void = () => {}) {
  const torrents = useTorrentsStore();
  const ui = useUiStore();
  const visibility = useDocumentVisibility();

  const poller = createPoller({
    fetch: (rid, signal) => qbit.getMaindata(rid, signal),
    onData: (data) => torrents.apply(data),
    onStatus: (status) => (torrents.connection = status),
    onUnauthorized,
    interval: () => ui.refreshInterval,
  });

  watch(visibility, (v) => poller.setVisible(v !== 'hidden'), { immediate: true });
  poller.start();
  active = poller;

  onScopeDispose(() => {
    poller.stop();
    if (active === poller) active = null;
  });

  return poller;
}
