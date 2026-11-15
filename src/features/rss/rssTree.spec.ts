import { describe, expect, it } from 'vitest';
import type { RawRssFolder } from '@/types/qbit';
import {
  articleKey,
  buildRssTree,
  feedsUnder,
  findRssItem,
  foldersUnder,
  isSameOrInside,
  isValidRssItemName,
  joinRssPath,
  newestFirst,
  parentRssPath,
  parseArticleDate,
  rssSnapshotSignature,
  visibleTreeRows,
  type RssArticle,
} from './rssTree';

const raw = (): RawRssFolder => ({
  Top: {
    uid: 'u1',
    url: 'http://a/rss',
    articles: [
      { id: 'a1', isRead: true },
      { id: 'a2', title: 'Two', date: '2024-01-02T00:00:00Z' },
    ],
  },
  TV: {
    Shows: {
      uid: 'u2',
      url: 'http://b/rss',
      isLoading: true,
      refreshInterval: 0,
      articles: [{ id: 'a1' }],
    },
    Deep: { Inner: { uid: 'u3', url: 'http://c/rss' } },
  },
});

describe('rss paths', () => {
  it('joins, splits and tests containment with the backslash separator', () => {
    expect(joinRssPath('', 'A')).toBe('A');
    expect(joinRssPath('A', 'B')).toBe('A\\B');
    expect(parentRssPath('A\\B\\C')).toBe('A\\B');
    expect(parentRssPath('A')).toBe('');
    expect(isSameOrInside('A\\B', 'A')).toBe(true);
    expect(isSameOrInside('A', 'A')).toBe(true);
    expect(isSameOrInside('AB', 'A')).toBe(false);
    expect(isSameOrInside('anything', '')).toBe(true);
  });

  it('validates item names', () => {
    expect(isValidRssItemName('Good')).toBe(true);
    expect(isValidRssItemName('   ')).toBe(false);
    expect(isValidRssItemName('a\\b')).toBe(false);
  });

  it('builds unique article keys per feed', () => {
    expect(articleKey('u1', 'a1')).not.toBe(articleKey('u2', 'a1'));
  });
});

describe('parseArticleDate', () => {
  it('parses RFC 2822 and ISO dates and rejects junk', () => {
    expect(parseArticleDate('Tue, 02 Jan 2024 00:00:00 GMT')).toBe(Date.UTC(2024, 0, 2));
    expect(parseArticleDate('2024-01-02T00:00:00Z')).toBe(Date.UTC(2024, 0, 2));
    expect(parseArticleDate('nope')).toBeNull();
    expect(parseArticleDate(undefined)).toBeNull();
    expect(parseArticleDate('')).toBeNull();
  });
});

describe('buildRssTree', () => {
  it('builds nested folders and feeds with paths and unread counts', () => {
    const tree = buildRssTree(raw());
    expect(tree.unreadCount).toBe(2);
    const [top, tv] = tree.children;
    expect(top).toMatchObject({ kind: 'feed', path: 'Top', name: 'Top', unreadCount: 1 });
    expect(tv).toMatchObject({ kind: 'folder', path: 'TV', unreadCount: 1 });
    const shows = findRssItem(tree, 'TV\\Shows');
    expect(shows).toMatchObject({ kind: 'feed', isLoading: true, refreshInterval: 0 });
  });

  it('fills defaults for missing optional fields', () => {
    const tree = buildRssTree(raw());
    const feed = findRssItem(tree, 'TV\\Deep\\Inner');
    expect(feed).toMatchObject({ refreshInterval: null, articles: [], unreadCount: 0, title: '' });
    const top = findRssItem(tree, 'Top');
    if (top?.kind !== 'feed') throw new Error('expected feed');
    expect(top.articles[1]).toMatchObject({
      key: articleKey('u1', 'a2'),
      feedPath: 'Top',
      feedName: 'Top',
      author: '',
      torrentUrl: '',
      dateMs: Date.UTC(2024, 0, 2),
    });
  });

  it('treats locally-read keys as read', () => {
    const tree = buildRssTree(raw(), new Set([articleKey('u1', 'a2')]));
    expect(findRssItem(tree, 'Top')?.unreadCount).toBe(0);
    expect(tree.unreadCount).toBe(1);
  });

  it('treats an empty folder as a folder, not a feed', () => {
    const tree = buildRssTree({ Empty: {} });
    expect(tree.children[0]).toMatchObject({ kind: 'folder', children: [] });
  });
});

describe('tree queries', () => {
  const tree = buildRssTree(raw());

  it('lists feeds and folders under a node', () => {
    expect(feedsUnder(tree).map((f) => f.path)).toEqual(['Top', 'TV\\Shows', 'TV\\Deep\\Inner']);
    expect(foldersUnder(tree).map((f) => f.path)).toEqual(['', 'TV', 'TV\\Deep']);
  });

  it('finds items by path, root for empty path, undefined when missing', () => {
    expect(findRssItem(tree, '')).toBe(tree);
    expect(findRssItem(tree, 'TV\\Deep')?.kind).toBe('folder');
    expect(findRssItem(tree, 'TV\\Nope')).toBeUndefined();
    expect(findRssItem(tree, 'Nope')).toBeUndefined();
  });

  it('hides the children of collapsed folders', () => {
    expect(visibleTreeRows(tree, new Set()).map((r) => [r.node.path, r.depth])).toEqual([
      ['Top', 0],
      ['TV', 0],
      ['TV\\Shows', 1],
      ['TV\\Deep', 1],
      ['TV\\Deep\\Inner', 2],
    ]);
    expect(visibleTreeRows(tree, new Set(['TV'])).map((r) => r.node.path)).toEqual(['Top', 'TV']);
  });

  it('sorts articles newest first with undated last', () => {
    const make = (id: string, dateMs: number | null) => ({ id, dateMs }) as RssArticle;
    expect(
      newestFirst([make('old', 1), make('none', null), make('new', 5)]).map((a) => a.id),
    ).toEqual(['new', 'old', 'none']);
  });
});

describe('rssSnapshotSignature', () => {
  it('is stable for equal snapshots and changes on read state, feed state and structure', () => {
    const base = rssSnapshotSignature(raw());
    expect(rssSnapshotSignature(raw())).toBe(base);

    const read = raw();
    (read.Top as { articles: { id: string; isRead?: boolean }[] }).articles[1]!.isRead = true;
    expect(rssSnapshotSignature(read)).not.toBe(base);

    const errored = raw();
    (errored.Top as { hasError?: boolean }).hasError = true;
    expect(rssSnapshotSignature(errored)).not.toBe(base);

    const newArticle = raw();
    (newArticle.Top as { articles: { id: string }[] }).articles.push({ id: 'a3' });
    expect(rssSnapshotSignature(newArticle)).not.toBe(base);

    expect(rssSnapshotSignature({ ...raw(), Extra: {} })).not.toBe(base);
  });

  it('ignores article fields that do not affect the UI poll cadence', () => {
    const changed = raw();
    (changed.Top as { articles: { id: string; title?: string }[] }).articles[0]!.title = 'x';
    expect(rssSnapshotSignature(changed)).toBe(rssSnapshotSignature(raw()));
  });
});
