import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QbtHttpError } from '@/services/qbit';
import type { MaindataResponse } from '@/types/qbit';
import {
  createPoller,
  MAX_BACKOFF_MS,
  STALE_AFTER_HIDDEN_MS,
  type PollerDeps,
} from './useMaindata';

const INTERVAL = 1000;

function setup(fetchImpl?: PollerDeps['fetch']) {
  let clock = 0;
  let nextRid = 1;
  const deps = {
    fetch: vi.fn<PollerDeps['fetch']>(
      fetchImpl ?? (async () => ({ rid: nextRid++ }) as MaindataResponse),
    ),
    onData: vi.fn(),
    onStatus: vi.fn(),
    onUnauthorized: vi.fn(),
    interval: () => INTERVAL,
    now: () => clock,
  };
  const poller = createPoller(deps);
  return {
    deps,
    poller,
    advanceClock: (ms: number) => (clock += ms),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createPoller', () => {
  it('starts with rid 0 and chains the returned rid', async () => {
    const { deps, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.fetch.mock.calls[0]![0]).toBe(0);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(deps.fetch.mock.calls[1]![0]).toBe(1);
    expect(deps.onData).toHaveBeenCalledTimes(2);
    expect(deps.onStatus).toHaveBeenLastCalledWith('connected');
  });

  it('keeps a single request in flight and schedules after the response', async () => {
    let resolve!: (v: MaindataResponse) => void;
    const { deps, poller } = setup(() => new Promise((r) => (resolve = r)));
    poller.start();
    await vi.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(deps.fetch).toHaveBeenCalledTimes(1);

    resolve({ rid: 1 });
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially on failure, capped, and recovers', async () => {
    let fail = true;
    const { deps, poller } = setup(async () => {
      if (fail) throw new TypeError('Failed to fetch');
      return { rid: 1 };
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0); // fail #1 → wait 2s
    expect(deps.onStatus).toHaveBeenLastCalledWith('disconnected');
    await vi.advanceTimersByTimeAsync(2 * INTERVAL - 1);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // fail #2 → 4s
    await vi.advanceTimersByTimeAsync(4 * INTERVAL); // fail #3 → 8s
    await vi.advanceTimersByTimeAsync(8 * INTERVAL); // fail #4 → capped at 10s
    expect(deps.fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS - 1);
    expect(deps.fetch).toHaveBeenCalledTimes(4);

    fail = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.onStatus).toHaveBeenLastCalledWith('connected');
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(deps.fetch).toHaveBeenCalledTimes(6);
  });

  it('stops and reports unauthorized on 403', async () => {
    const { deps, poller } = setup(async () => {
      throw new QbtHttpError(403, 'Forbidden');
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onUnauthorized).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.onStatus).not.toHaveBeenCalledWith('disconnected');
  });

  it('pauses while hidden and polls immediately when visible after a long absence', async () => {
    const { deps, poller, advanceClock } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.fetch).toHaveBeenCalledTimes(1);

    advanceClock(STALE_AFTER_HIDDEN_MS + 1);
    poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it('resumes on the normal interval after a short absence', async () => {
    const { deps, poller, advanceClock } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.setVisible(false);
    advanceClock(500);
    poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it('pollNow runs immediately when idle and right after an in-flight request otherwise', async () => {
    let resolve: ((v: MaindataResponse) => void) | null = null;
    let rid = 1;
    const { deps, poller } = setup(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.pollNow(); // in flight → queued
    resolve!({ rid: rid++ });
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch).toHaveBeenCalledTimes(2);

    resolve!({ rid: rid++ });
    await vi.advanceTimersByTimeAsync(0);
    poller.pollNow(); // idle → immediate
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
  });

  it('stop aborts the in-flight request and ignores its result', async () => {
    let signal!: AbortSignal;
    let resolve!: (v: MaindataResponse) => void;
    const { deps, poller } = setup((_rid, s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    expect(signal.aborted).toBe(true);
    resolve({ rid: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.onData).not.toHaveBeenCalled();
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it('restarts from rid 0', async () => {
    const { deps, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    poller.stop();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.fetch.mock.calls.at(-1)![0]).toBe(0);
  });
});
