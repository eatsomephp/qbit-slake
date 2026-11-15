// search/* for MockProvider: results trickle in on wall-clock time, deterministic per pattern and plugin.

import type {
  RawSearchJob,
  RawSearchPlugin,
  RawSearchResult,
  RawSearchResults,
} from '@/types/qbit';
import { QbtHttpError } from './http';

const MAX_CONCURRENT_SEARCHES = 5;
const MS_PER_RESULT = 40;

const CATEGORY_NAMES: Record<string, string> = {
  all: 'All categories',
  anime: 'Anime',
  books: 'Books',
  games: 'Games',
  movies: 'Movies',
  music: 'Music',
  pictures: 'Pictures',
  software: 'Software',
  tv: 'TV shows',
};

const categories = (...ids: string[]) =>
  ['all', ...ids].map((id) => ({ id, name: CATEGORY_NAMES[id] ?? id }));

const INITIAL_PLUGINS: RawSearchPlugin[] = [
  {
    name: 'archiveorg',
    fullName: 'Internet Archive',
    version: '1.6',
    url: 'https://archive.example.org',
    enabled: true,
    supportedCategories: categories('books', 'movies', 'music', 'software'),
  },
  {
    name: 'linuxtracker',
    fullName: 'Linux Tracker',
    version: '2.3',
    url: 'https://linuxtracker.example.org',
    enabled: true,
    supportedCategories: categories('software'),
  },
  {
    name: 'publicdomain',
    fullName: 'Public Domain Torrents',
    version: '1.12',
    url: 'https://publicdomain.example.org',
    enabled: true,
    supportedCategories: categories('movies', 'tv'),
  },
  {
    name: 'privatesite',
    fullName: 'Private Site (needs a login)',
    version: '0.9',
    url: 'https://private.example.org',
    enabled: false,
    supportedCategories: categories('anime', 'games', 'movies', 'tv'),
  },
];

const SUFFIXES = [
  '1080p WEB-DL',
  '720p',
  'Complete',
  'amd64 ISO',
  'FLAC',
  'EPUB',
  'Remastered',
  'x265 HEVC',
  'Source',
  'Collection',
];

interface MockJob {
  id: number;
  pattern: string;
  category: string;
  plugins: string[];
  startedAt: number;
  results: RawSearchResult[];
  stoppedAt: number | null;
}

function seededRandom(seed: string) {
  let state = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function hex40(random: () => number): string {
  return Array.from({ length: 40 }, () => Math.floor(random() * 16).toString(16)).join('');
}

function resultsFor(pattern: string, plugin: RawSearchPlugin): RawSearchResult[] {
  const random = seededRandom(`${pattern}:${plugin.name}`);
  const count = 20 + Math.floor(random() * 180);
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => {
    const name = `${pattern} ${SUFFIXES[Math.floor(random() * SUFFIXES.length)]} ${2000 + Math.floor(random() * 27)}`;
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`;
    const isMagnet = random() < 0.4;
    return {
      fileName: name,
      fileUrl: isMagnet
        ? `magnet:?xt=urn:btih:${hex40(random)}&dn=${encodeURIComponent(name)}`
        : `${plugin.url}/download/${slug}.torrent`,
      fileSize: random() < 0.05 ? -1 : Math.floor(random() * 30 * 2 ** 30),
      nbSeeders: random() < 0.05 ? -1 : Math.floor(random() ** 3 * 2000),
      nbLeechers: random() < 0.05 ? -1 : Math.floor(random() ** 3 * 400),
      engineName: plugin.name,
      engineFullName: plugin.fullName,
      siteUrl: plugin.url,
      descrLink: i % 17 === 3 ? `javascript:alert(${i})` : `${plugin.url}/details/${slug}`,
      pubDate: random() < 0.1 ? 0 : now - Math.floor(random() * 3 * 365 * 86400),
    };
  });
}

function interleave(lists: RawSearchResult[][]): RawSearchResult[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, i) =>
    lists.flatMap((list) => (i < list.length ? [list[i]!] : [])),
  ).flat();
}

export class MockSearch {
  private plugins: RawSearchPlugin[] = INITIAL_PLUGINS.map((plugin) => ({ ...plugin }));
  private jobs = new Map<number, MockJob>();
  private nextId = 1;

  constructor() {
    const id = this.start('debian', 'all', 'enabled');
    const job = this.jobs.get(id)!;
    job.startedAt -= 600_000;
    job.stoppedAt = job.startedAt + job.results.length * MS_PER_RESULT;
  }

  start(pattern: string, category: string, scope: string): number {
    if (!pattern.trim()) throw new QbtHttpError(400, 'Missing pattern');
    const running = [...this.jobs.values()].filter((job) => this.isRunning(job));
    if (running.length >= MAX_CONCURRENT_SEARCHES)
      throw new QbtHttpError(
        409,
        `Unable to create more than ${MAX_CONCURRENT_SEARCHES} concurrent searches.`,
      );
    const names = scope.split('|');
    const chosen =
      scope === 'all'
        ? this.plugins
        : scope === 'enabled'
          ? this.plugins.filter((plugin) => plugin.enabled)
          : this.plugins.filter((plugin) => names.includes(plugin.name));
    const matching = chosen.filter(
      (plugin) => category === 'all' || plugin.supportedCategories.some((c) => c.id === category),
    );
    const id = this.nextId++;
    this.jobs.set(id, {
      id,
      pattern: pattern.trim(),
      category,
      plugins: chosen.map((plugin) => plugin.name),
      startedAt: Date.now(),
      results: interleave(matching.map((plugin) => resultsFor(pattern.trim(), plugin))),
      stoppedAt: null,
    });
    return id;
  }

  stop(id: number) {
    const job = this.job(id);
    if (this.isRunning(job)) job.stoppedAt = Date.now();
  }

  remove(id: number) {
    this.job(id);
    this.jobs.delete(id);
  }

  status(): RawSearchJob[] {
    return [...this.jobs.values()].map((job) => ({
      id: job.id,
      status: this.isRunning(job) ? 'Running' : 'Stopped',
      total: this.found(job).length,
      pattern: job.pattern,
      category: job.category,
      plugins: job.plugins,
    }));
  }

  results(id: number, offset: number): RawSearchResults {
    const job = this.job(id);
    const found = this.found(job);
    return {
      status: this.isRunning(job) ? 'Running' : 'Stopped',
      results: found.slice(offset),
      total: found.length,
    };
  }

  pluginList(): RawSearchPlugin[] {
    return this.plugins.map((plugin) => ({ ...plugin }));
  }

  install(sources: string[]) {
    for (const source of sources) {
      const name = source
        .split(/[\\/]/)
        .pop()!
        .replace(/\.py$/i, '')
        .replace(/[^a-z0-9_]/gi, '');
      if (!name || this.plugins.some((plugin) => plugin.name === name)) continue;
      this.plugins.push({
        name,
        fullName: name.charAt(0).toUpperCase() + name.slice(1),
        version: '1.0',
        url: `https://${name}.example.org`,
        enabled: true,
        supportedCategories: categories('movies', 'software'),
      });
    }
  }

  uninstall(names: string[]) {
    this.plugins = this.plugins.filter((plugin) => !names.includes(plugin.name));
  }

  enable(names: string[], enabled: boolean) {
    for (const plugin of this.plugins) if (names.includes(plugin.name)) plugin.enabled = enabled;
  }

  private job(id: number): MockJob {
    const job = this.jobs.get(id);
    if (!job) throw new QbtHttpError(404, 'Not Found');
    return job;
  }

  private found(job: MockJob): RawSearchResult[] {
    const until = job.stoppedAt ?? Date.now();
    return job.results.slice(0, Math.floor((until - job.startedAt) / MS_PER_RESULT));
  }

  private isRunning(job: MockJob): boolean {
    return job.stoppedAt === null && this.found(job).length < job.results.length;
  }
}
