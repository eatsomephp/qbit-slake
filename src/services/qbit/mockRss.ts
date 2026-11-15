import type { RawRssArticle, RawRssFeed, RawRssFolder, RawRssRule } from '@/types/qbit';
import { QbtHttpError } from './http';

const SEPARATOR = '\\';
const REFRESH_MS = 1200;

interface MockFeed extends RawRssFeed {
  articles: RawRssArticle[];
  loadingUntil?: number;
}

type MockFolder = Map<string, MockFeed | MockFolder>;

const SHOWS = ['Northern Lights', 'The Long Orbit', 'Paper Harbors', 'Quiet Signals'];
const DISTROS = ['debian', 'ubuntu', 'fedora', 'archlinux', 'linuxmint'];

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toUTCString();
}

function episodeArticles(feedKey: string, count: number): RawRssArticle[] {
  return Array.from({ length: count }, (_, i) => {
    const show = SHOWS[i % SHOWS.length]!;
    const season = 1 + Math.floor(i / 8);
    const episode = 1 + (i % 8);
    const title = `${show} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} 1080p WEB-DL x265`;
    return {
      id: `${feedKey}-${i}`,
      title,
      date: hoursAgo(i * 7 + 1),
      author: 'release-bot',
      link: `https://tv.example.org/releases/${feedKey}-${i}`,
      description: `<p><strong>${title}</strong></p><p>Size: ${(1.2 + (i % 5) * 0.3).toFixed(1)} GiB · Seeders: ${40 - i}</p><ul><li>Video: HEVC 1920×1080</li><li>Audio: E-AC-3 5.1</li></ul><p><a href="https://tv.example.org/releases/${feedKey}-${i}">Release page</a></p>`,
      torrentURL: `https://tv.example.org/download/${feedKey}-${i}.torrent`,
      isRead: i > 5,
    };
  });
}

function distroArticles(count: number): RawRssArticle[] {
  return Array.from({ length: count }, (_, i) => {
    const distro = DISTROS[i % DISTROS.length]!;
    const title = `${distro}-${12 + Math.floor(i / 5)}.${i % 5}-amd64.iso`;
    return {
      id: `distro-${i}`,
      title,
      date: hoursAgo(i * 30 + 2),
      link: `https://linux.example.net/${distro}`,
      description: `New ${distro} image released.`,
      torrentURL: `magnet:?xt=urn:btih:${(i + 1).toString(16).padStart(40, 'a')}&dn=${encodeURIComponent(title)}`,
      isRead: i > 2,
    };
  });
}

function feed(uid: string, url: string, title: string, articles: RawRssArticle[]): MockFeed {
  return {
    uid,
    url,
    title,
    lastBuildDate: hoursAgo(1),
    isLoading: false,
    hasError: false,
    refreshInterval: 0,
    articles,
  };
}

function isFeed(item: MockFeed | MockFolder): item is MockFeed {
  return !(item instanceof Map);
}

function splitPath(path: string): string[] {
  return path.split(SEPARATOR).filter(Boolean);
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(escaped, 'i');
}

function matchesExpression(title: string, expression: string, useRegex: boolean): boolean {
  if (useRegex) {
    try {
      return new RegExp(expression, 'i').test(title);
    } catch {
      return false;
    }
  }
  return expression.split('|').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .every((word) => wildcardToRegExp(word).test(title)),
  );
}

export class MockRss {
  private root: MockFolder = new Map<string, MockFeed | MockFolder>([
    [
      'TV',
      new Map<string, MockFeed | MockFolder>([
        [
          'ShowRSS',
          feed(
            'a1',
            'https://tv.example.org/rss/shows.xml',
            'ShowRSS: my shows',
            episodeArticles('shows', 24),
          ),
        ],
        [
          'Anime weekly',
          feed(
            'a2',
            'https://anime.example.org/feed',
            'Anime weekly',
            episodeArticles('anime', 12),
          ),
        ],
      ]),
    ],
    [
      'Linux ISOs',
      feed('a3', 'https://linux.example.net/rss', 'Linux releases', distroArticles(15)),
    ],
    [
      'Broken feed',
      { ...feed('a4', 'https://down.example.com/rss', '', []), hasError: true, lastBuildDate: '' },
    ],
  ]);
  private nextUid = 5;
  private rules = new Map<string, RawRssRule>([
    [
      'Northern Lights',
      {
        enabled: true,
        priority: 0,
        useRegex: false,
        mustContain: 'northern lights 1080p',
        mustNotContain: '',
        episodeFilter: '1x1-;',
        affectedFeeds: ['https://tv.example.org/rss/shows.xml'],
        ignoreDays: 0,
        lastMatch: hoursAgo(50),
        smartFilter: true,
        previouslyMatchedEpisodes: ['S01E01', 'S01E02'],
        torrentParams: {
          category: 'tv',
          tags: ['new'],
          save_path: '',
          stopped: null,
          content_layout: null,
        },
      },
    ],
    [
      'Debian images',
      {
        enabled: false,
        priority: 1,
        useRegex: true,
        mustContain: '^debian-\\d+',
        mustNotContain: '',
        episodeFilter: '',
        affectedFeeds: ['https://linux.example.net/rss'],
        ignoreDays: 0,
        lastMatch: '',
        smartFilter: false,
        previouslyMatchedEpisodes: [],
        torrentParams: {
          category: 'linux',
          tags: [],
          save_path: '/downloads/linux',
          use_auto_tmm: false,
          stopped: true,
          content_layout: 'NoSubfolder',
        },
      },
    ],
  ]);

  items(withData: boolean): RawRssFolder {
    const now = Date.now();
    const serialize = (folder: MockFolder): RawRssFolder => {
      const out: RawRssFolder = {};
      for (const [name, item] of folder) {
        if (!isFeed(item)) {
          out[name] = serialize(item);
          continue;
        }
        if (item.loadingUntil && item.loadingUntil <= now) this.finishRefresh(item);
        const { uid, url, title, lastBuildDate, isLoading, hasError, refreshInterval, articles } =
          item;
        const summary: RawRssFeed = {
          uid,
          url,
          title,
          lastBuildDate,
          isLoading,
          hasError,
          refreshInterval,
        };
        out[name] = withData ? { ...summary, articles: articles.map((a) => ({ ...a })) } : summary;
      }
      return out;
    };
    return serialize(this.root);
  }

  addFolder(path: string) {
    const { parent, name } = this.locateNew(path);
    parent.set(name, new Map());
  }

  addFeed(url: string, path: string) {
    if (!/^https?:\/\//i.test(url)) throw new QbtHttpError(409, `Invalid feed URL: ${url}`);
    if (this.allFeeds().some((f) => f.url === url))
      throw new QbtHttpError(409, `RSS feed with given URL already exists: ${url}.`);
    const { parent, name } = this.locateNew(path || url);
    const created = feed(`a${this.nextUid++}`, url, '', []);
    created.loadingUntil = Date.now() + REFRESH_MS;
    created.isLoading = true;
    parent.set(name, created);
  }

  setFeedUrl(path: string, url: string) {
    const item = this.find(path);
    if (!item || !isFeed(item)) throw new QbtHttpError(409, `Feed doesn't exist: ${path}.`);
    item.url = url;
  }

  setRefreshInterval(path: string, seconds: number) {
    const item = this.find(path);
    if (!item || !isFeed(item)) throw new QbtHttpError(409, `Feed doesn't exist: ${path}.`);
    item.refreshInterval = seconds;
  }

  move(itemPath: string, destPath: string) {
    const item = this.find(itemPath);
    if (!item) throw new QbtHttpError(409, `Item doesn't exist: ${itemPath}.`);
    if (destPath === itemPath || destPath.startsWith(itemPath + SEPARATOR))
      throw new QbtHttpError(409, 'Cannot move an item into itself.');
    const { parent, name } = this.locateNew(destPath);
    this.detach(itemPath);
    parent.set(name, item);
  }

  remove(path: string) {
    if (!this.find(path)) throw new QbtHttpError(409, `Item doesn't exist: ${path}.`);
    this.detach(path);
  }

  markAsRead(itemPath: string, articleId?: string) {
    const item = this.find(itemPath);
    if (!item) return;
    const feeds = isFeed(item) ? [item] : this.allFeeds(item);
    for (const f of feeds)
      for (const article of f.articles)
        if (articleId === undefined || article.id === articleId) article.isRead = true;
  }

  refresh(itemPath: string) {
    const item = this.find(itemPath);
    if (!item) return;
    const feeds = isFeed(item) ? [item] : this.allFeeds(item);
    for (const f of feeds) {
      f.isLoading = true;
      f.loadingUntil = Date.now() + REFRESH_MS;
    }
  }

  getRules(): Record<string, RawRssRule> {
    return Object.fromEntries([...this.rules].map(([name, rule]) => [name, structuredClone(rule)]));
  }

  setRule(name: string, rule: RawRssRule) {
    const defaults: RawRssRule = {
      enabled: true,
      priority: this.rules.size,
      useRegex: false,
      mustContain: '',
      mustNotContain: '',
      episodeFilter: '',
      affectedFeeds: [],
      ignoreDays: 0,
      lastMatch: '',
      smartFilter: false,
      previouslyMatchedEpisodes: [],
      torrentParams: { category: '', tags: [], save_path: '', stopped: null, content_layout: null },
    };
    this.rules.set(name, { ...defaults, ...structuredClone(rule) });
  }

  renameRule(name: string, newName: string) {
    const rule = this.rules.get(name);
    if (!rule || this.rules.has(newName)) return;
    this.rules.delete(name);
    this.rules.set(newName, rule);
  }

  cloneRule(sourceName: string, cloneName: string) {
    const rule = this.rules.get(sourceName);
    if (!rule || this.rules.has(cloneName)) return;
    this.rules.set(cloneName, {
      ...structuredClone(rule),
      previouslyMatchedEpisodes: [],
      lastMatch: '',
    });
  }

  removeRule(name: string) {
    this.rules.delete(name);
  }

  matchingArticles(ruleName: string): Record<string, string[]> {
    const rule = this.rules.get(ruleName);
    if (!rule) return {};
    const result: Record<string, string[]> = {};
    for (const [name, f] of this.namedFeeds()) {
      if (!rule.affectedFeeds?.includes(f.url)) continue;
      const titles = f.articles
        .map((a) => a.title ?? '')
        .filter(
          (title) =>
            (!rule.mustContain || matchesExpression(title, rule.mustContain, !!rule.useRegex)) &&
            !(
              rule.mustNotContain && matchesExpression(title, rule.mustNotContain, !!rule.useRegex)
            ),
        );
      if (titles.length) result[name] = titles;
    }
    return result;
  }

  exportRules(): Blob {
    return new Blob([JSON.stringify(this.getRules(), null, 4)], { type: 'application/json' });
  }

  async importRules(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new QbtHttpError(400, 'Invalid rules file: not JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new QbtHttpError(400, 'Invalid rules file: expected an object of rules.');
    for (const [name, rule] of Object.entries(parsed)) this.setRule(name, rule as RawRssRule);
  }

  private finishRefresh(item: MockFeed) {
    item.loadingUntil = undefined;
    item.isLoading = false;
    if (item.hasError) return;
    item.title ||= item.url.replace(/^https?:\/\//, '');
    item.lastBuildDate = new Date().toUTCString();
    const id = `${item.uid}-new-${Date.now()}`;
    const title = `${SHOWS[Math.floor(Math.random() * SHOWS.length)]} S02E0${1 + Math.floor(Math.random() * 8)} 2160p WEB-DL`;
    item.articles.unshift({
      id,
      title,
      date: new Date().toUTCString(),
      link: `https://tv.example.org/releases/${id}`,
      description: `<p>${title}</p>`,
      torrentURL: `https://tv.example.org/download/${id}.torrent`,
      isRead: false,
    });
  }

  private find(path: string): MockFeed | MockFolder | undefined {
    let current: MockFeed | MockFolder = this.root;
    for (const part of splitPath(path)) {
      if (isFeed(current)) return undefined;
      const next: MockFeed | MockFolder | undefined = current.get(part);
      if (!next) return undefined;
      current = next;
    }
    return current;
  }

  private locateNew(path: string): { parent: MockFolder; name: string } {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) throw new QbtHttpError(409, 'Item path cannot be empty.');
    const parent = this.find(parts.join(SEPARATOR));
    if (!parent || isFeed(parent))
      throw new QbtHttpError(409, `Parent folder doesn't exist: ${parts.join(SEPARATOR)}.`);
    if (parent.has(name))
      throw new QbtHttpError(409, `An item with the given path already exists: ${path}.`);
    return { parent, name };
  }

  private detach(path: string) {
    const parts = splitPath(path);
    const name = parts.pop()!;
    const parent = this.find(parts.join(SEPARATOR));
    if (parent && !isFeed(parent)) parent.delete(name);
  }

  private allFeeds(folder: MockFolder = this.root): MockFeed[] {
    return [...folder.values()].flatMap((item) => (isFeed(item) ? [item] : this.allFeeds(item)));
  }

  private namedFeeds(folder: MockFolder = this.root): [string, MockFeed][] {
    return [...folder.entries()].flatMap(([name, item]) =>
      isFeed(item) ? [[name, item] as [string, MockFeed]] : this.namedFeeds(item),
    );
  }
}
