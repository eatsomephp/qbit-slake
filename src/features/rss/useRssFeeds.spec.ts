import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QbtHttpError } from '@/services/qbit/http';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import type { RawRssFolder } from '@/types/qbit';
import type { RssArticle } from './rssTree';

const qbit = vi.hoisted(() => ({
  getRssItems: vi.fn(),
  markRssAsRead: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { createRssFeeds } = await import('./useRssFeeds');

const snapshot = (isRead = false): RawRssFolder => ({
  Feed: { uid: 'u1', url: 'http://a', articles: [{ id: 'a1', isRead }] },
});

let scope: EffectScope;

function start() {
  scope = effectScope();
  return scope.run(() => createRssFeeds())!;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setActivePinia(createPinia());
  useUiStore().refreshInterval = 1000;
  qbit.getRssItems.mockReset().mockResolvedValue(snapshot());
  qbit.markRssAsRead.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  scope?.stop();
  vi.useRealTimers();
});

const article = (over: Partial<RssArticle> = {}) =>
  ({ key: 'u1\na1', id: 'a1', feedPath: 'Feed', isRead: false, ...over }) as RssArticle;

describe('createRssFeeds polling', () => {
  it('loads the tree immediately with article data', async () => {
    const feeds = start();
    await settle();
    expect(qbit.getRssItems).toHaveBeenCalledWith(true, expect.any(AbortSignal));
    expect(feeds.tree.value?.unreadCount).toBe(1);
    expect(feeds.feeds.value.map((f) => f.path)).toEqual(['Feed']);
    expect(feeds.loadError.value).toBeNull();
  });

  it('backs off while the snapshot is unchanged and resets when it changes', async () => {
    const feeds = start();
    await settle();
    expect(qbit.getRssItems).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(3);

    qbit.getRssItems.mockResolvedValue(snapshot(true));
    await vi.advanceTimersByTimeAsync(4000);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(4);
    expect(feeds.tree.value?.unreadCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(5);
  });

  it('caps the backoff at one minute', async () => {
    start();
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const calls = qbit.getRssItems.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(qbit.getRssItems.mock.calls.length).toBe(calls + 1);
  });

  it('keeps the normal cadence while a feed is loading', async () => {
    qbit.getRssItems.mockResolvedValue({
      Feed: { uid: 'u1', url: 'http://a', isLoading: true, articles: [] },
    });
    start();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(6);
  });

  it('reports load errors, but not 403s, and recovers', async () => {
    qbit.getRssItems.mockRejectedValue(new Error('down'));
    const feeds = start();
    await settle();
    expect(feeds.loadError.value).toBe("Couldn't load RSS feeds.");

    qbit.getRssItems.mockResolvedValue(snapshot());
    await vi.advanceTimersByTimeAsync(2000);
    expect(feeds.loadError.value).toBeNull();
    expect(feeds.tree.value).not.toBeNull();
  });

  it('stays quiet on 403 (session expired)', async () => {
    qbit.getRssItems.mockRejectedValue(new QbtHttpError(403, null));
    const feeds = start();
    await settle();
    expect(feeds.loadError.value).toBeNull();
  });

  it('stops polling once the scope is disposed', async () => {
    start();
    await settle();
    scope.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(1);
  });

  it('pollNow refetches immediately and resets the backoff', async () => {
    const feeds = start();
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1500);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(2);
    feeds.pollNow();
    await settle();
    expect(qbit.getRssItems).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1999);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(qbit.getRssItems).toHaveBeenCalledTimes(4);
  });
});

describe('perform', () => {
  it('returns true and refreshes after success', async () => {
    const feeds = start();
    await settle();
    const before = qbit.getRssItems.mock.calls.length;
    await expect(feeds.perform('Add', async () => {})).resolves.toBe(true);
    await settle();
    expect(qbit.getRssItems.mock.calls.length).toBe(before + 1);
  });

  it('toasts failures with the label, refreshes anyway, and returns false', async () => {
    const feeds = start();
    await settle();
    const before = qbit.getRssItems.mock.calls.length;
    const result = await feeds.perform('Add feed', () => Promise.reject(new Error('nope')));
    await settle();
    expect(result).toBe(false);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Add feed failed: /);
    expect(qbit.getRssItems.mock.calls.length).toBe(before + 1);
  });

  it('does not toast a 403', async () => {
    const feeds = start();
    await settle();
    const result = await feeds.perform('Add feed', () =>
      Promise.reject(new QbtHttpError(403, null)),
    );
    expect(result).toBe(false);
    expect(useToastsStore().toasts).toHaveLength(0);
  });
});

describe('markArticleRead', () => {
  it('marks the article read at once, then follows the server', async () => {
    const feeds = start();
    await settle();
    let resolveMark!: () => void;
    qbit.markRssAsRead.mockReturnValue(new Promise<void>((r) => (resolveMark = r)));

    const pending = feeds.markArticleRead(article());
    expect(feeds.tree.value?.unreadCount).toBe(0);
    expect(qbit.markRssAsRead).toHaveBeenCalledWith('Feed', 'a1');

    qbit.getRssItems.mockResolvedValue(snapshot(true));
    resolveMark();
    await pending;
    await settle();
    expect(feeds.tree.value?.unreadCount).toBe(0);
  });

  it('keeps the local override until the server confirms it', async () => {
    const feeds = start();
    await settle();
    await feeds.markArticleRead(article());
    await settle();
    expect(feeds.tree.value?.unreadCount).toBe(0);
  });

  it('rolls back and toasts when the request fails', async () => {
    const feeds = start();
    await settle();
    qbit.markRssAsRead.mockRejectedValue(new Error('boom'));
    await feeds.markArticleRead(article());
    await settle();
    expect(feeds.tree.value?.unreadCount).toBe(1);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Mark as read failed/);
  });

  it('ignores already-read articles', async () => {
    const feeds = start();
    await settle();
    await feeds.markArticleRead(article({ isRead: true }));
    expect(qbit.markRssAsRead).not.toHaveBeenCalled();
  });
});
