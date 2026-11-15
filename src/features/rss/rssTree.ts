import type { RawRssArticle, RawRssFeed, RawRssFolder } from '@/types/qbit';

export const RSS_PATH_SEPARATOR = '\\';

export interface RssArticle {
  key: string;
  id: string;
  feedUid: string;
  feedPath: string;
  feedName: string;
  title: string;
  dateMs: number | null;
  author: string;
  link: string;
  description: string;
  torrentUrl: string;
  isRead: boolean;
}

export interface RssFeedNode {
  kind: 'feed';
  path: string;
  name: string;
  uid: string;
  url: string;
  title: string;
  isLoading: boolean;
  hasError: boolean;
  /** Seconds, 0 for the global interval; null when the server doesn't report it. */
  refreshInterval: number | null;
  articles: RssArticle[];
  unreadCount: number;
}

export interface RssFolderNode {
  kind: 'folder';
  path: string;
  name: string;
  children: RssItemNode[];
  unreadCount: number;
}

export type RssItemNode = RssFeedNode | RssFolderNode;

export interface RssTreeRow {
  node: RssItemNode;
  depth: number;
}

export function articleKey(feedUid: string, articleId: string): string {
  return `${feedUid}\n${articleId}`;
}

export function joinRssPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}${RSS_PATH_SEPARATOR}${name}` : name;
}

export function parentRssPath(path: string): string {
  const cut = path.lastIndexOf(RSS_PATH_SEPARATOR);
  return cut === -1 ? '' : path.slice(0, cut);
}

export function isSameOrInside(path: string, ancestorPath: string): boolean {
  return (
    ancestorPath === '' ||
    path === ancestorPath ||
    path.startsWith(ancestorPath + RSS_PATH_SEPARATOR)
  );
}

export function isRssFeed(raw: RawRssFeed | RawRssFolder): raw is RawRssFeed {
  return typeof (raw as RawRssFeed).uid === 'string';
}

export function parseArticleDate(date: string | undefined): number | null {
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

function toArticle(
  raw: RawRssArticle,
  feed: { uid: string; path: string; name: string },
  locallyRead: ReadonlySet<string>,
): RssArticle {
  const key = articleKey(feed.uid, raw.id);
  return {
    key,
    id: raw.id,
    feedUid: feed.uid,
    feedPath: feed.path,
    feedName: feed.name,
    title: raw.title ?? '',
    dateMs: parseArticleDate(raw.date),
    author: raw.author ?? '',
    link: raw.link ?? '',
    description: raw.description ?? '',
    torrentUrl: raw.torrentURL ?? '',
    isRead: !!raw.isRead || locallyRead.has(key),
  };
}

function toFeed(
  raw: RawRssFeed,
  path: string,
  name: string,
  locallyRead: ReadonlySet<string>,
): RssFeedNode {
  const articles = (raw.articles ?? []).map((a) =>
    toArticle(a, { uid: raw.uid, path, name }, locallyRead),
  );
  return {
    kind: 'feed',
    path,
    name,
    uid: raw.uid,
    url: raw.url,
    title: raw.title ?? '',
    isLoading: !!raw.isLoading,
    hasError: !!raw.hasError,
    refreshInterval: typeof raw.refreshInterval === 'number' ? raw.refreshInterval : null,
    articles,
    unreadCount: articles.reduce((n, a) => (a.isRead ? n : n + 1), 0),
  };
}

export function buildRssTree(
  raw: RawRssFolder,
  locallyRead: ReadonlySet<string> = new Set(),
  path = '',
  name = '',
): RssFolderNode {
  const children: RssItemNode[] = Object.entries(raw).map(([childName, child]) => {
    const childPath = joinRssPath(path, childName);
    return isRssFeed(child)
      ? toFeed(child, childPath, childName, locallyRead)
      : buildRssTree(child, locallyRead, childPath, childName);
  });
  return {
    kind: 'folder',
    path,
    name,
    children,
    unreadCount: children.reduce((n, c) => n + c.unreadCount, 0),
  };
}

export function feedsUnder(node: RssItemNode): RssFeedNode[] {
  return node.kind === 'feed' ? [node] : node.children.flatMap(feedsUnder);
}

export function foldersUnder(node: RssFolderNode): RssFolderNode[] {
  return [node, ...node.children.flatMap((c) => (c.kind === 'folder' ? foldersUnder(c) : []))];
}

export function findRssItem(root: RssFolderNode, path: string): RssItemNode | undefined {
  if (path === '') return root;
  for (const child of root.children) {
    if (child.path === path) return child;
    if (child.kind === 'folder' && isSameOrInside(path, child.path))
      return findRssItem(child, path);
  }
  return undefined;
}

export function newestFirst(articles: RssArticle[]): RssArticle[] {
  return articles.sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));
}

export function visibleTreeRows(
  folder: RssFolderNode,
  collapsed: ReadonlySet<string>,
  depth = 0,
): RssTreeRow[] {
  return folder.children.flatMap((node) => [
    { node, depth },
    ...(node.kind === 'folder' && !collapsed.has(node.path)
      ? visibleTreeRows(node, collapsed, depth + 1)
      : []),
  ]);
}

// The poller backs off while this stays the same: anything shown that isn't in it would update late.
export function rssSnapshotSignature(raw: RawRssFolder): string {
  const parts: string[] = [];
  const walk = (folder: RawRssFolder, path: string) => {
    for (const [name, child] of Object.entries(folder)) {
      const childPath = joinRssPath(path, name);
      if (!isRssFeed(child)) {
        parts.push(`d:${childPath}`);
        walk(child, childPath);
        continue;
      }
      parts.push(
        `f:${childPath}|${child.uid}|${child.url}|${child.title ?? ''}|${child.isLoading ? 1 : 0}|${child.hasError ? 1 : 0}|${child.refreshInterval ?? ''}`,
      );
      for (const article of child.articles ?? [])
        parts.push(`${article.id}|${article.isRead ? 1 : 0}`);
    }
  };
  walk(raw, '');
  return parts.join('\n');
}

export function isValidRssItemName(name: string): boolean {
  return name.trim() !== '' && !name.includes(RSS_PATH_SEPARATOR);
}
