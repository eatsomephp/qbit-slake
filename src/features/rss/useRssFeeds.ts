import {
  computed,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue';
import { useDocumentVisibility } from '@vueuse/core';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import type { RawRssFolder } from '@/types/qbit';
import {
  articleKey,
  buildRssTree,
  feedsUnder,
  isRssFeed,
  rssSnapshotSignature,
  type RssArticle,
} from './rssTree';

const MAX_POLL_INTERVAL_MS = 60_000;

function serverArticleStates(raw: RawRssFolder): Map<string, boolean> {
  const states = new Map<string, boolean>();
  const walk = (folder: RawRssFolder) => {
    for (const child of Object.values(folder)) {
      if (!isRssFeed(child)) {
        walk(child);
        continue;
      }
      for (const article of child.articles ?? [])
        states.set(articleKey(child.uid, article.id), !!article.isRead);
    }
  };
  walk(raw);
  return states;
}

function anyFeedLoading(folder: RawRssFolder): boolean {
  return Object.values(folder).some((child) =>
    isRssFeed(child) ? !!child.isLoading : anyFeedLoading(child),
  );
}

// rss/items with articles is the whole RSS store on every poll: like qBittorrent's own WebUI, back off while nothing changes.
export function createRssFeeds() {
  const ui = useUiStore();
  const toasts = useToastsStore();
  const visibility = useDocumentVisibility();
  const raw = shallowRef<RawRssFolder | null>(null);
  const loadError = shallowRef<string | null>(null);
  const locallyRead = shallowRef<ReadonlySet<string>>(new Set());

  const tree = computed(() => (raw.value ? buildRssTree(raw.value, locallyRead.value) : null));
  const feeds = computed(() => (tree.value ? feedsUnder(tree.value) : []));

  let lastSignature = '';
  let intervalMs = ui.refreshInterval;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let disposed = false;

  function schedule() {
    clearTimeout(timer);
    if (!disposed && visibility.value !== 'hidden') timer = setTimeout(poll, intervalMs);
  }

  function dropConfirmedOverrides(next: RawRssFolder) {
    if (!locallyRead.value.size) return;
    const states = serverArticleStates(next);
    const pending = [...locallyRead.value].filter((key) => states.get(key) === false);
    if (pending.length !== locallyRead.value.size) locallyRead.value = new Set(pending);
  }

  async function poll() {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    try {
      const next = await qbit.getRssItems(true, controller.signal);
      const signature = rssSnapshotSignature(next);
      const changed = signature !== lastSignature;
      lastSignature = signature;
      dropConfirmedOverrides(next);
      if (changed || !raw.value) raw.value = next;
      loadError.value = null;
      intervalMs =
        changed || anyFeedLoading(next)
          ? ui.refreshInterval
          : Math.min(intervalMs * 2, MAX_POLL_INTERVAL_MS);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!(err instanceof QbtHttpError && err.status === 403))
        loadError.value = "Couldn't load RSS feeds.";
      intervalMs = Math.min(intervalMs * 2, MAX_POLL_INTERVAL_MS);
    } finally {
      if (inFlight === controller) {
        inFlight = null;
        schedule();
      }
    }
  }

  function pollNow() {
    intervalMs = ui.refreshInterval;
    clearTimeout(timer);
    void poll();
  }

  async function perform(label: string, call: () => Promise<void>): Promise<boolean> {
    try {
      await call();
      return true;
    } catch (err) {
      if (!(err instanceof QbtHttpError && err.status === 403))
        toasts.error(`${label} failed: ${describeQbtError(err)}`);
      return false;
    } finally {
      pollNow();
    }
  }

  async function markArticleRead(article: RssArticle) {
    if (article.isRead) return;
    locallyRead.value = new Set(locallyRead.value).add(article.key);
    try {
      await qbit.markRssAsRead(article.feedPath, article.id);
    } catch (err) {
      const rest = new Set(locallyRead.value);
      rest.delete(article.key);
      locallyRead.value = rest;
      if (!(err instanceof QbtHttpError && err.status === 403))
        toasts.error(`Mark as read failed: ${describeQbtError(err)}`);
    }
    pollNow();
  }

  watch(visibility, (state) => {
    if (state === 'visible') pollNow();
    else clearTimeout(timer);
  });

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(timer);
    inFlight?.abort();
  });

  pollNow();

  return { tree, feeds, loadError, pollNow, perform, markArticleRead };
}

export type RssFeeds = ReturnType<typeof createRssFeeds>;

const RSS_FEEDS_KEY: InjectionKey<RssFeeds> = Symbol('rssFeeds');

export function provideRssFeeds(): RssFeeds {
  const feeds = createRssFeeds();
  provide(RSS_FEEDS_KEY, feeds);
  return feeds;
}

export function useRssFeeds(): RssFeeds {
  const feeds = inject(RSS_FEEDS_KEY);
  if (!feeds) throw new Error('useRssFeeds() needs provideRssFeeds() in an ancestor');
  return feeds;
}
