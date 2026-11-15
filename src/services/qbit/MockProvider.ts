import { faker } from '@faker-js/faker';
import type { IProvider } from './IProvider';
import type {
  AddTorrentOptions,
  AddTorrentResult,
  CategoryOptions,
  MetadataLookup,
  NewTorrentOptions,
  SearchJob,
  SearchPlugin,
  SearchPluginScope,
  SearchResultsPage,
  QueueMove,
  ShareLimits,
  TorrentCreationTask,
  TorrentMetadata,
  TrackerChanges,
} from '@/types/app';
import {
  ConnectionStatus,
  ETA_INFINITY,
  LIMIT_GLOBAL,
  ShareLimitAction,
  ShareLimitsMode,
  TorrentState,
} from '@/constants/qbit';
import type {
  MaindataResponse,
  PeersResponse,
  RawBuildInfo,
  RawCategory,
  RawServerState,
  RawTorrent,
  RawLogEntry,
  RawPeerLogEntry,
  RawNetworkInterface,
  RawProcessInfo,
  RawCookie,
  NewCookie,
  RawPreferences,
  RawSpeedLimits,
  RawRssFolder,
  RawRssRule,
  RawTorrentFile,
  RawTorrentProperties,
  RawTracker,
  RawWebSeed,
} from '@/types/qbit';
import { QbtHttpError } from './http';
import { MockCreator } from './mockCreator';
import { MockDetails } from './mockDetails';
import { MockLog } from './mockLog';
import { MockRss } from './mockRss';
import { MockSearch } from './mockSearch';
import { PREFERENCES_5_3_0 } from './fixtures/preferences-5.3.0';
import {
  normalizeCreationTask,
  normalizeSearchJob,
  normalizeSearchPlugin,
  normalizeSearchResults,
} from '@/sync/normalize';

const DEFAULT_COUNT = 5000;

const DEFAULT_SHARE_LIMITS: ShareLimits = {
  ratioLimit: LIMIT_GLOBAL,
  seedingTimeLimit: LIMIT_GLOBAL,
  inactiveSeedingTimeLimit: LIMIT_GLOBAL,
  action: ShareLimitAction.Default,
  mode: ShareLimitsMode.Default,
};

function rawCategoryShareLimits(limits: ShareLimits): Partial<RawCategory> {
  return {
    ratio_limit: limits.ratioLimit,
    seeding_time_limit: limits.seedingTimeLimit,
    inactive_seeding_time_limit: limits.inactiveSeedingTimeLimit,
    share_limit_action: limits.action,
    share_limits_mode: limits.mode,
  };
}

const CATEGORIES: RawCategory[] = [
  {
    name: 'linux',
    savePath: '/downloads/linux',
    ...rawCategoryShareLimits({
      ...DEFAULT_SHARE_LIMITS,
      ratioLimit: 2,
      action: ShareLimitAction.Remove,
    }),
  },
  {
    name: 'movies',
    savePath: '/downloads/movies',
    ...rawCategoryShareLimits(DEFAULT_SHARE_LIMITS),
  },
  { name: 'tv', savePath: '/downloads/tv', ...rawCategoryShareLimits(DEFAULT_SHARE_LIMITS) },
  { name: 'music', savePath: '/downloads/music', ...rawCategoryShareLimits(DEFAULT_SHARE_LIMITS) },
  { name: 'books', savePath: '/downloads/books', ...rawCategoryShareLimits(DEFAULT_SHARE_LIMITS) },
];
const TAGS = ['hd', '4k', 'keep', 'new', 'archive', 'cross-seed'];
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'https://tracker.example.org/announce',
  'https://linuxtracker.example.net:443/announce',
  'udp://tracker.torrent.example:6969/announce',
  'https://academic.example.edu/announce',
];
const MOCK_DIRECTORIES: Record<string, string[]> = {
  '/': ['config', 'downloads', 'media', 'webui'],
  '/config': ['logs', 'qBittorrent'],
  '/config/logs': [],
  '/config/qBittorrent': ['BT_backup'],
  '/config/qBittorrent/BT_backup': [],
  '/downloads': ['books', 'incomplete', 'linux', 'movies', 'music', 'tv'],
  '/downloads/books': [],
  '/downloads/incomplete': [],
  '/downloads/linux': [],
  '/downloads/movies': [],
  '/downloads/music': [],
  '/downloads/tv': [],
  '/media': ['library'],
  '/media/library': [],
  '/webui': [],
};

const MOCK_FILES: Record<string, string[]> = {
  '/downloads/books': ['field-guide-to-mosses.epub', 'public-domain-poetry.pdf'],
  '/downloads/linux': ['debian-12.8.0-amd64-netinst.iso', 'fedora-41-x86_64.iso'],
  '/downloads/music': ['live-at-the-commons.flac'],
  '/media/library': ['home-movies-2025.mkv'],
};

function mockHostPathExists(path: string): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (MOCK_DIRECTORIES[normalized]) return true;
  const separator = normalized.lastIndexOf('/');
  const parent = separator > 0 ? normalized.slice(0, separator) : '/';
  return MOCK_FILES[parent]?.includes(normalized.slice(separator + 1)) ?? false;
}

const MOCK_NETWORK_INTERFACES = [
  { name: 'lo', value: 'lo', addresses: ['127.0.0.1', '::1'] },
  { name: 'eth0', value: 'eth0', addresses: ['192.168.1.20', 'fe80::1c2b:3aff:fe4d:5e6f'] },
  { name: 'wg0', value: 'wg0', addresses: ['10.2.0.2'] },
];

const DISTROS = ['debian', 'ubuntu', 'fedora', 'archlinux', 'linuxmint', 'opensuse', 'alpine'];

const ACTIVE_DL = new Set<string>([TorrentState.Downloading, TorrentState.ForcedDL]);
const ACTIVE_UP = new Set<string>([TorrentState.Uploading, TorrentState.ForcedUP]);

type Diff = Partial<RawTorrent>;

function sourceName(url: string): string {
  const dn = url.startsWith('magnet:')
    ? new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('dn')
    : null;
  return dn ?? url.split('/').pop() ?? url;
}

function hex40(): string {
  return faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' });
}

function torrentName(category: string): string {
  switch (category) {
    case 'linux':
      return `${faker.helpers.arrayElement(DISTROS)}-${faker.system.semver()}-${faker.helpers.arrayElement(['amd64', 'arm64', 'x86_64'])}.iso`;
    case 'music':
      return `${faker.music.artist()} - ${faker.music.album()} (${faker.number.int({ min: 1965, max: 2026 })}) [FLAC]`;
    case 'books':
      return `${faker.book.author()} - ${faker.book.title()} (epub)`;
    default: {
      const title = faker.word.words({ count: { min: 1, max: 4 } }).replace(/\s+/g, '.');
      const res = faker.helpers.arrayElement(['720p', '1080p', '2160p']);
      return `${title}.${faker.number.int({ min: 1950, max: 2026 })}.${res}.WEB-DL.x265-${faker.string.alpha({ length: 4, casing: 'upper' })}`;
    }
  }
}

/**
 * Stand-in for qBittorrent in mock mode and the demo build. Holds a stable set of
 * torrents whose speed, progress and state drift every poll, with an occasional add
 * and remove, so the merge path is always exercised. Assumes a single client: any
 * rid other than the last one served gets a full update.
 */
export class MockProvider implements IProvider {
  private rid = 0;
  private torrents = new Map<string, RawTorrent>();
  private trackers = new Map<string, Set<string>>();
  private serverState: RawServerState;
  private lastTick = Date.now();
  private pending = new Map<string, Diff>();
  private pendingRemoved: string[] = [];
  private pendingTrackers = new Set<string>();
  /** Torrents being rechecked → when the check ends and the state to restore. */
  private details = new MockDetails();
  private log = new MockLog();
  private rss = new MockRss();
  private search = new MockSearch();
  private creator = new MockCreator(mockHostPathExists);
  private categories = new Map(CATEGORIES.map((c) => [c.name, { ...c }]));
  private tags = new Set(TAGS);
  private pendingCategories = new Set<string>();
  private pendingCategoriesRemoved = new Set<string>();
  private pendingTags = new Set<string>();
  private pendingTagsRemoved = new Set<string>();
  private checking = new Map<string, { until: number; restore: TorrentState }>();
  private clientData = new Map<string, unknown>();
  private metadataLookups = new Map<string, { readyAt: number; metadata: TorrentMetadata }>();
  private metadataCache = new Map<string, TorrentMetadata>();
  private cookies: RawCookie[] = [
    {
      name: 'uid',
      domain: '.tracker.example',
      path: '/',
      value: '48213',
      expirationDate: Math.floor(Date.now() / 1000) + 180 * 86_400,
    },
    { name: 'pass', domain: 'feeds.example.org', path: '/', value: '9f3c2a7e', expirationDate: -1 },
  ];
  private launchTime = Math.floor(Date.now() / 1000) - 3 * 86_400 - 5 * 3600;

  constructor(count = Number(import.meta.env.VITE_FAKE_TORRENTS) || DEFAULT_COUNT) {
    faker.seed(42);
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < count; i++) this.insert(this.generate(now));
    this.writeQueue(this.queue());
    this.pending.clear();
    this.pendingTrackers.clear();
    this.serverState = {
      alltime_dl: 18_435_123_456_789,
      alltime_ul: 52_123_456_789_012,
      average_time_queue: 0,
      connection_status: ConnectionStatus.Connected,
      dht_nodes: 412,
      dl_info_data: 0,
      dl_info_speed: 0,
      dl_rate_limit: 0,
      free_space_on_disk: 2_345_678_901_234,
      global_ratio: '2.83',
      last_external_address_v4: '203.0.113.42',
      last_external_address_v6: '2001:db8::42',
      queued_io_jobs: 0,
      queued_tracker_announces: 0,
      queueing: true,
      read_cache_hits: '0',
      read_cache_overload: '0',
      refresh_interval: 1500,
      request_latency: 0,
      session_state: false,
      total_buffers_size: 0,
      total_peer_connections: 0,
      total_queued_size: 0,
      total_wasted_session: 0,
      up_info_data: 0,
      up_info_speed: 0,
      up_rate_limit: 0,
      use_alt_speed_limits: false,
      use_subcategories: false,
      write_cache_overload: '0',
    };
  }

  async login(): Promise<boolean> {
    return true;
  }

  async logout(): Promise<void> {}

  async shutdown(): Promise<void> {}

  // Illustrative pairing: recent enough that the share-limit adapters are exercised.
  async getVersion(): Promise<string> {
    return '5.3.0';
  }

  async getWebApiVersion(): Promise<string> {
    return '2.16.2';
  }

  async getMaindata(rid: number): Promise<MaindataResponse> {
    this.tick();
    const full = rid === 0 || rid !== this.rid;
    this.rid += 1;
    const res = full ? this.fullSnapshot() : this.diff();
    this.pending.clear();
    this.pendingRemoved = [];
    this.pendingTrackers.clear();
    this.pendingCategories.clear();
    this.pendingCategoriesRemoved.clear();
    this.pendingTags.clear();
    this.pendingTagsRemoved.clear();
    return res;
  }

  async startTorrents(hashes: string[]): Promise<void> {
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'force_start', false);
      if (t.state === TorrentState.StoppedDL || t.state === TorrentState.ForcedDL)
        this.set(hash, t, 'state', TorrentState.Downloading);
      else if (t.state === TorrentState.StoppedUP || t.state === TorrentState.ForcedUP)
        this.set(hash, t, 'state', TorrentState.StalledUP);
    });
  }

  async setForceStart(hashes: string[], value: boolean): Promise<void> {
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'force_start', value);
      if (t.state.startsWith('checking') || t.state === TorrentState.Error) return;
      const done = t.progress >= 1;
      if (value) this.set(hash, t, 'state', done ? TorrentState.ForcedUP : TorrentState.ForcedDL);
      else if (t.state === TorrentState.ForcedDL)
        this.set(hash, t, 'state', TorrentState.Downloading);
      else if (t.state === TorrentState.ForcedUP)
        this.set(hash, t, 'state', TorrentState.StalledUP);
    });
  }

  async setAutoManagement(hashes: string[], enable: boolean): Promise<void> {
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'auto_tmm', enable);
      if (enable)
        this.set(hash, t, 'save_path', this.categories.get(t.category)?.savePath || '/downloads');
    });
  }

  async toggleSequentialDownload(hashes: string[]): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'seq_dl', !t.seq_dl));
  }

  async toggleFirstLastPiecePrio(hashes: string[]): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'f_l_piece_prio', !t.f_l_piece_prio));
  }

  async setSuperSeeding(hashes: string[], value: boolean): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'super_seeding', value));
  }

  async exportTorrent(hash: string): Promise<Blob> {
    const { name } = this.require(hash);
    const bencodedName = `${new TextEncoder().encode(name).length}:${name}`;
    return new Blob([`d4:infod4:name${bencodedName}12:piece lengthi16384e6:pieces0:ee`], {
      type: 'application/x-bittorrent',
    });
  }

  async stopTorrents(hashes: string[]): Promise<void> {
    this.each(hashes, (hash, t) => {
      const stopped = t.progress >= 1 ? TorrentState.StoppedUP : TorrentState.StoppedDL;
      this.set(hash, t, 'state', stopped);
      this.checking.delete(hash);
    });
  }

  async deleteTorrents(hashes: string[]): Promise<void> {
    for (const hash of hashes) this.remove(hash);
  }

  async recheckTorrents(hashes: string[]): Promise<void> {
    const until = Date.now() + 4000;
    this.each(hashes, (hash, t) => {
      const done = t.progress >= 1;
      const restore = t.state.startsWith('checking') ? this.checking.get(hash)?.restore : t.state;
      this.checking.set(hash, { until, restore: restore ?? t.state });
      this.set(hash, t, 'state', done ? TorrentState.CheckingUP : TorrentState.CheckingDL);
    });
  }

  async reannounceTorrents(): Promise<void> {}

  async moveInQueue(hashes: string[], move: QueueMove): Promise<void> {
    if (!this.serverState.queueing) throw new QbtHttpError(409, 'Torrent queueing must be enabled');
    const order = this.queue();
    const moving = new Set(hashes);
    if (move === 'top' || move === 'bottom') {
      const picked = order.filter((h) => moving.has(h));
      const rest = order.filter((h) => !moving.has(h));
      this.writeQueue(move === 'top' ? [...picked, ...rest] : [...rest, ...picked]);
      return;
    }
    const step = move === 'up' ? -1 : 1;
    const positions = order.flatMap((h, i) => (moving.has(h) ? [i] : []));
    if (step > 0) positions.reverse();
    for (const i of positions) {
      const neighbour = order[i + step];
      if (neighbour === undefined || moving.has(neighbour)) continue;
      order[i + step] = order[i]!;
      order[i] = neighbour;
    }
    this.writeQueue(order);
  }

  async addTorrents(o: AddTorrentOptions): Promise<AddTorrentResult> {
    const additions = [
      ...o.urls.map((url) => {
        const metadata = this.metadataCache.get(url);
        this.metadataCache.delete(url);
        return { name: metadata?.name ?? sourceName(url), metadata };
      }),
      ...o.files.map((f) => ({ name: f.name.replace(/\.torrent$/i, ''), metadata: undefined })),
    ];
    if (!additions.length) return { ok: false, failed: 0 };
    if (o.filePriorities?.length) {
      const metadata = additions.length === 1 ? additions[0]!.metadata : undefined;
      if (!metadata)
        throw new QbtHttpError(
          400,
          '`filePriorities` may only be specified when metadata has already been fetched',
        );
      if (metadata.files.length !== o.filePriorities.length)
        throw new QbtHttpError(
          400,
          'Length of filePriorities must equal number of files in torrent',
        );
    }
    const now = Math.floor(Date.now() / 1000);
    const autoTmm = o.autoTmm ?? this.prefs.auto_tmm_enabled;
    const categoryPath = this.categories.get(o.category)?.savePath;
    const savePath = (autoTmm ? categoryPath : o.savePath || categoryPath) || '/downloads';
    const useDownloadPath = !autoTmm && (o.useDownloadPath ?? this.prefs.temp_path_enabled);
    for (const { metadata, ...addition } of additions) {
      const name = o.rename || addition.name;
      const t = this.generate(now);
      Object.assign(t, {
        name,
        added_on: now,
        category: o.category,
        tags: o.tags.join(', '),
        save_path: savePath,
        content_path: `${savePath}/${name}`,
        progress: 0,
        downloaded: 0,
        completed: 0,
        amount_left: metadata?.size ?? t.size,
        uploaded: 0,
        ratio: 0,
        completion_on: -1,
        seq_dl: o.sequential,
        f_l_piece_prio: o.firstLastPiecePrio,
        state: o.stopped ? TorrentState.StoppedDL : TorrentState.Downloading,
        priority: this.queue().length + 1,
        auto_tmm: autoTmm,
        download_path: useDownloadPath ? o.downloadPath || this.prefs.temp_path : '',
        dl_limit: o.dlLimit ?? 0,
        up_limit: o.upLimit ?? 0,
      } satisfies Partial<RawTorrent>);
      if (o.shareLimits)
        Object.assign(t, {
          ratio_limit: o.shareLimits.ratioLimit,
          seeding_time_limit: o.shareLimits.seedingTimeLimit,
          inactive_seeding_time_limit: o.shareLimits.inactiveSeedingTimeLimit,
          share_limit_action: o.shareLimits.action,
          share_limits_mode: o.shareLimits.mode,
        } satisfies Partial<RawTorrent>);
      if (metadata) {
        Object.assign(t, { size: metadata.size, total_size: metadata.size });
        this.insert(t, metadata.infoHashV1);
        this.details.adoptMetadata(metadata.infoHashV1, metadata, o.filePriorities);
      } else {
        this.insert(t);
      }
    }
    for (const tag of o.tags) this.addTagName(tag);
    return { ok: true, failed: 0 };
  }

  async fetchMetadata(source: string): Promise<MetadataLookup> {
    let lookup = this.metadataLookups.get(source);
    if (!lookup) {
      const name = sourceName(source).replace(/\.torrent$/i, '');
      lookup = { readyAt: Date.now() + 2500, metadata: this.details.metadata(source, name) };
      this.metadataLookups.set(source, lookup);
    }
    const { metadata } = lookup;
    if (Date.now() < lookup.readyAt) {
      const isMagnet = source.startsWith('magnet:');
      return { status: 'pending', infoHashV1: isMagnet ? metadata.infoHashV1 : '', infoHashV2: '' };
    }
    this.metadataCache.set(source, metadata);
    return { status: 'ready', metadata };
  }

  async parseMetadata(file: File): Promise<TorrentMetadata> {
    const metadata = this.details.metadata(
      `${file.name}:${file.size}`,
      file.name.replace(/\.torrent$/i, ''),
    );
    this.metadataCache.set(metadata.infoHashV1, metadata);
    return metadata;
  }

  async cancelFetchMetadata(source: string): Promise<void> {
    const lookup = this.metadataLookups.get(source);
    if (!lookup) throw new QbtHttpError(404, '');
    this.metadataLookups.delete(source);
    this.metadataCache.delete(source);
  }

  async setCategory(hashes: string[], category: string): Promise<void> {
    if (category && !this.categories.has(category))
      throw new QbtHttpError(409, 'Incorrect category name');
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'category', category);
      if (t.auto_tmm)
        this.set(hash, t, 'save_path', this.categories.get(category)?.savePath || '/downloads');
    });
  }

  async addTags(hashes: string[], tags: string[]): Promise<void> {
    tags.forEach((tag) => this.addTagName(tag));
    this.each(hashes, (hash, t) => {
      const set = new Set(t.tags ? t.tags.split(', ') : []);
      tags.forEach((tag) => set.add(tag));
      this.set(hash, t, 'tags', [...set].join(', '));
    });
  }

  async removeTags(hashes: string[], tags: string[]): Promise<void> {
    this.each(hashes, (hash, t) => {
      const kept = (t.tags ? t.tags.split(', ') : []).filter((x) => !tags.includes(x));
      this.set(hash, t, 'tags', kept.join(', '));
    });
  }

  async createCategory(name: string, options: CategoryOptions): Promise<void> {
    if (!name || this.categories.has(name)) throw new QbtHttpError(409, 'Invalid category name');
    this.categories.set(name, {
      ...rawCategoryShareLimits(DEFAULT_SHARE_LIMITS),
      name,
      savePath: '',
    });
    this.applyCategoryOptions(name, options);
    this.pendingCategoriesRemoved.delete(name);
  }

  async editCategory(name: string, options: CategoryOptions): Promise<void> {
    if (!this.categories.has(name)) throw new QbtHttpError(409, 'Category does not exist');
    this.applyCategoryOptions(name, options);
  }

  private applyCategoryOptions(name: string, options: CategoryOptions): void {
    const cat = this.categories.get(name)!;
    cat.savePath = options.savePath;
    if (options.shareLimits) Object.assign(cat, rawCategoryShareLimits(options.shareLimits));
    this.pendingCategories.add(name);
  }

  async removeCategories(names: string[]): Promise<void> {
    for (const name of names) {
      if (!this.categories.delete(name)) continue;
      this.pendingCategories.delete(name);
      this.pendingCategoriesRemoved.add(name);
      for (const [hash, t] of this.torrents)
        if (t.category === name) this.set(hash, t, 'category', '');
    }
  }

  async createTags(tags: string[]): Promise<void> {
    tags.forEach((tag) => this.addTagName(tag));
  }

  async deleteTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      if (!this.tags.delete(tag)) continue;
      this.pendingTags.delete(tag);
      this.pendingTagsRemoved.add(tag);
    }
    await this.removeTags([...this.torrents.keys()], tags);
  }

  async setLocation(hashes: string[], location: string): Promise<void> {
    if (!location) throw new QbtHttpError(400, 'Save path is empty');
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'save_path', location);
      this.set(hash, t, 'auto_tmm', false);
    });
  }

  async setDownloadPath(hashes: string[], path: string): Promise<void> {
    this.each(hashes, (hash, t) => {
      if (!t.auto_tmm) this.set(hash, t, 'download_path', path);
    });
  }

  async setComment(hashes: string[], comment: string): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'comment', comment));
  }

  async renameTorrent(hash: string, name: string): Promise<void> {
    if (!name) throw new QbtHttpError(409, 'Invalid name');
    this.set(hash, this.require(hash), 'name', name);
  }

  async setDownloadLimit(hashes: string[], limit: number): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'dl_limit', Math.max(limit, 0)));
  }

  async setUploadLimit(hashes: string[], limit: number): Promise<void> {
    this.each(hashes, (hash, t) => this.set(hash, t, 'up_limit', Math.max(limit, 0)));
  }

  async setShareLimits(hashes: string[], limits: ShareLimits): Promise<void> {
    this.each(hashes, (hash, t) => {
      this.set(hash, t, 'ratio_limit', limits.ratioLimit);
      this.set(hash, t, 'seeding_time_limit', limits.seedingTimeLimit);
      this.set(hash, t, 'inactive_seeding_time_limit', limits.inactiveSeedingTimeLimit);
      this.set(hash, t, 'share_limit_action', limits.action);
      this.set(hash, t, 'share_limits_mode', limits.mode);
    });
  }

  async toggleAltSpeedLimits(): Promise<void> {
    const s = this.serverState;
    s.use_alt_speed_limits = !s.use_alt_speed_limits;
    s.dl_rate_limit = s.use_alt_speed_limits ? this.prefs.alt_dl_limit : this.prefs.dl_limit;
    s.up_rate_limit = s.use_alt_speed_limits ? this.prefs.alt_up_limit : this.prefs.up_limit;
  }

  async pauseSession(): Promise<void> {
    this.serverState.session_state = true;
  }

  async resumeSession(): Promise<void> {
    this.serverState.session_state = false;
  }

  async setGlobalDownloadLimit(limit: number): Promise<void> {
    const key = this.serverState.use_alt_speed_limits ? 'alt_dl_limit' : 'dl_limit';
    this.prefs[key] = Math.max(limit, 0);
    this.serverState.dl_rate_limit = this.prefs[key];
  }

  async setGlobalUploadLimit(limit: number): Promise<void> {
    const key = this.serverState.use_alt_speed_limits ? 'alt_up_limit' : 'up_limit';
    this.prefs[key] = Math.max(limit, 0);
    this.serverState.up_rate_limit = this.prefs[key];
  }

  async getSpeedLimits(): Promise<RawSpeedLimits> {
    const { dl_limit, up_limit, alt_dl_limit, alt_up_limit } = this.prefs;
    return { dl_limit, up_limit, alt_dl_limit, alt_up_limit };
  }

  async setSpeedLimits(limits: RawSpeedLimits): Promise<void> {
    await this.setPreferences({ ...limits });
  }

  async getPreferences(): Promise<RawPreferences> {
    return structuredClone(this.prefs);
  }

  async setPreferences(changes: Partial<RawPreferences>): Promise<void> {
    Object.assign(this.prefs, changes);
    if ('max_ratio' in changes) this.prefs.max_ratio_enabled = this.prefs.max_ratio >= 0;
    if ('max_seeding_time' in changes) {
      this.prefs.max_seeding_time_enabled = this.prefs.max_seeding_time >= 0;
    }
    const s = this.serverState;
    s.dl_rate_limit = s.use_alt_speed_limits ? this.prefs.alt_dl_limit : this.prefs.dl_limit;
    s.up_rate_limit = s.use_alt_speed_limits ? this.prefs.alt_up_limit : this.prefs.up_limit;
    s.queueing = this.prefs.queueing_enabled;
  }

  private prefs: RawPreferences = structuredClone(PREFERENCES_5_3_0);

  async rotateApiKey(): Promise<string> {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const apiKey = `qbt_${hex}`;
    this.prefs.web_ui_api_key = apiKey;
    return apiKey;
  }

  async deleteApiKey(): Promise<void> {
    this.prefs.web_ui_api_key = '';
  }

  async getNetworkInterfaces(): Promise<RawNetworkInterface[]> {
    return MOCK_NETWORK_INTERFACES.map(({ name, value }) => ({ name, value }));
  }

  async getNetworkInterfaceAddresses(iface: string): Promise<string[]> {
    return MOCK_NETWORK_INTERFACES.filter((entry) => !iface || entry.value === iface).flatMap(
      (entry) => entry.addresses,
    );
  }

  async getDirectoryContent(dirPath: string, mode: 'dirs' | 'files' = 'dirs'): Promise<string[]> {
    if (!dirPath.startsWith('/')) throw new QbtHttpError(400, 'Invalid directory path');
    const normalized = dirPath.length > 1 ? dirPath.replace(/\/+$/, '') : dirPath;
    if (!MOCK_DIRECTORIES[normalized]) throw new QbtHttpError(404, 'Directory does not exist');
    const children = (mode === 'dirs' ? MOCK_DIRECTORIES : MOCK_FILES)[normalized] ?? [];
    return children.map((name) => (normalized === '/' ? `/${name}` : `${normalized}/${name}`));
  }

  async getBuildInfo(): Promise<RawBuildInfo> {
    return {
      qt: '6.9.1',
      libtorrent: '2.0.11.0',
      boost: '1.88.0',
      openssl: '3.5.1',
      zlib: '1.3.1',
      bitness: 64,
      platform: 'linux',
    };
  }

  async getProcessInfo(): Promise<RawProcessInfo> {
    return { launch_time: this.launchTime };
  }

  async getFreeSpaceAtPath(): Promise<number> {
    return this.serverState.free_space_on_disk;
  }

  async getCookies(): Promise<RawCookie[]> {
    return this.cookies.map((cookie) => ({ ...cookie }));
  }

  async setCookies(cookies: NewCookie[]): Promise<void> {
    this.cookies = cookies.map((cookie) => ({
      ...cookie,
      expirationDate: cookie.expirationDate ?? -1,
    }));
  }

  private addTagName(tag: string) {
    if (!tag || this.tags.has(tag)) return;
    this.tags.add(tag);
    this.pendingTags.add(tag);
    this.pendingTagsRemoved.delete(tag);
  }

  async getDefaultSavePath(): Promise<string> {
    return '/downloads';
  }

  async getProperties(hash: string): Promise<RawTorrentProperties> {
    return this.details.properties(hash, this.require(hash));
  }

  async getTrackers(hash: string): Promise<RawTracker[]> {
    return this.details.trackers(hash, this.require(hash));
  }

  async addTrackers(hash: string, urls: string): Promise<void> {
    this.details.addTrackers(hash, this.require(hash), urls);
    this.syncTrackerIndex(hash);
  }

  async editTracker(hash: string, url: string, changes: TrackerChanges): Promise<void> {
    this.details.editTracker(hash, this.require(hash), url, changes);
    this.syncTrackerIndex(hash);
  }

  async removeTrackers(hash: string, urls: string[]): Promise<void> {
    this.details.removeTrackers(hash, this.require(hash), urls);
    this.syncTrackerIndex(hash);
  }

  async getWebSeeds(hash: string): Promise<RawWebSeed[]> {
    return this.details.webSeeds(hash, this.require(hash));
  }

  async addWebSeeds(hash: string, urls: string[]): Promise<void> {
    this.details.addWebSeeds(hash, this.require(hash), urls);
  }

  async editWebSeed(hash: string, url: string, newUrl: string): Promise<void> {
    this.details.editWebSeed(hash, this.require(hash), url, newUrl);
  }

  async removeWebSeeds(hash: string, urls: string[]): Promise<void> {
    this.details.removeWebSeeds(hash, this.require(hash), urls);
  }

  async getFiles(hash: string): Promise<RawTorrentFile[]> {
    return this.details.fileList(hash, this.require(hash));
  }

  async getPeers(hash: string, rid: number): Promise<PeersResponse> {
    return this.details.peerDiff(hash, this.require(hash), rid);
  }

  async addPeers(hashes: string[], peers: string[]): Promise<void> {
    for (const hash of hashes) this.details.addPeers(hash, this.require(hash), peers);
  }

  async banPeers(peers: string[]): Promise<void> {
    const ips = this.details.banPeers(peers);
    const banned = new Set(
      String(this.prefs.banned_IPs ?? '')
        .split('\n')
        .filter(Boolean),
    );
    ips.forEach((ip) => banned.add(ip));
    this.prefs.banned_IPs = [...banned].join('\n');
  }

  async setFilePriority(hash: string, indexes: number[], priority: number): Promise<void> {
    this.details.setPriority(hash, this.require(hash), indexes, priority);
  }

  async fileDownloadUrl(hash: string, index: number): Promise<string> {
    return this.details.fileDownloadUrl(hash, this.require(hash), index);
  }

  async renameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
    this.details.rename(hash, this.require(hash), oldPath, newPath, false);
  }

  async renameFolder(hash: string, oldPath: string, newPath: string): Promise<void> {
    this.details.rename(hash, this.require(hash), oldPath, newPath, true);
  }

  async getPieceStates(hash: string): Promise<number[]> {
    return this.details.pieceStates(hash, this.require(hash));
  }

  async getPieceAvailability(hash: string): Promise<number[]> {
    return this.details.pieceAvailability(hash, this.require(hash));
  }

  async getLog(lastKnownId: number): Promise<RawLogEntry[]> {
    return this.log.since(lastKnownId);
  }

  async getPeerLog(lastKnownId: number): Promise<RawPeerLogEntry[]> {
    return this.log.peersSince(lastKnownId);
  }

  async addTorrentCreationTask(options: NewTorrentOptions): Promise<string> {
    return this.creator.add(options);
  }

  async getTorrentCreationTasks(): Promise<TorrentCreationTask[]> {
    return this.creator.status().map(normalizeCreationTask);
  }

  async getCreatedTorrentFile(taskId: string): Promise<Blob> {
    return this.creator.torrentFile(taskId);
  }

  async deleteTorrentCreationTask(taskId: string): Promise<void> {
    this.creator.remove(taskId);
  }

  async startSearch(
    pattern: string,
    category: string,
    plugins: SearchPluginScope,
  ): Promise<number> {
    return this.search.start(
      pattern,
      category,
      typeof plugins === 'string' ? plugins : plugins.join('|'),
    );
  }

  async stopSearch(id: number): Promise<void> {
    this.search.stop(id);
  }

  async deleteSearch(id: number): Promise<void> {
    this.search.remove(id);
  }

  async getSearchJobs(): Promise<SearchJob[]> {
    return this.search.status().map(normalizeSearchJob);
  }

  async getSearchResults(id: number, offset: number): Promise<SearchResultsPage> {
    return normalizeSearchResults(this.search.results(id, offset), offset);
  }

  async downloadSearchResult(url: string): Promise<void> {
    await this.addTorrents({
      urls: [url],
      files: [],
      savePath: '',
      category: '',
      tags: [],
      stopped: false,
      sequential: false,
      firstLastPiecePrio: false,
      skipChecking: false,
    });
  }

  async getSearchPlugins(): Promise<SearchPlugin[]> {
    return this.search.pluginList().map(normalizeSearchPlugin);
  }

  async installSearchPlugins(sources: string[]): Promise<void> {
    this.search.install(sources);
  }

  async uninstallSearchPlugins(names: string[]): Promise<void> {
    this.search.uninstall(names);
  }

  async setSearchPluginsEnabled(names: string[], enabled: boolean): Promise<void> {
    this.search.enable(names, enabled);
  }

  async updateSearchPlugins(): Promise<void> {}

  async getRssItems(withData: boolean): Promise<RawRssFolder> {
    return this.rss.items(withData);
  }

  async addRssFolder(path: string): Promise<void> {
    this.rss.addFolder(path);
  }

  async addRssFeed(url: string, path: string): Promise<void> {
    this.rss.addFeed(url, path);
  }

  async setRssFeedUrl(path: string, url: string): Promise<void> {
    this.rss.setFeedUrl(path, url);
  }

  async setRssFeedRefreshInterval(path: string, seconds: number): Promise<void> {
    this.rss.setRefreshInterval(path, seconds);
  }

  async moveRssItem(itemPath: string, destPath: string): Promise<void> {
    this.rss.move(itemPath, destPath);
  }

  async removeRssItem(path: string): Promise<void> {
    this.rss.remove(path);
  }

  async markRssAsRead(itemPath: string, articleId?: string): Promise<void> {
    this.rss.markAsRead(itemPath, articleId);
  }

  async refreshRssItem(itemPath: string): Promise<void> {
    this.rss.refresh(itemPath);
  }

  async getRssRules(): Promise<Record<string, RawRssRule>> {
    return this.rss.getRules();
  }

  async setRssRule(name: string, rule: RawRssRule): Promise<void> {
    this.rss.setRule(name, rule);
  }

  async renameRssRule(name: string, newName: string): Promise<void> {
    this.rss.renameRule(name, newName);
  }

  async cloneRssRule(sourceName: string, cloneName: string): Promise<void> {
    this.rss.cloneRule(sourceName, cloneName);
  }

  async removeRssRule(name: string): Promise<void> {
    this.rss.removeRule(name);
  }

  async getRssMatchingArticles(ruleName: string): Promise<Record<string, string[]>> {
    return this.rss.matchingArticles(ruleName);
  }

  async exportRssRules(): Promise<Blob> {
    return this.rss.exportRules();
  }

  async importRssRules(file: File): Promise<void> {
    await this.rss.importRules(file);
  }

  async loadClientData(keys: string[]): Promise<Record<string, unknown>> {
    const entries = keys.filter((key) => this.clientData.has(key));
    return Object.fromEntries(
      entries.map((key) => [key, structuredClone(this.clientData.get(key))]),
    );
  }

  async storeClientData(data: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      if (value === null) this.clientData.delete(key);
      else this.clientData.set(key, structuredClone(value));
    }
  }

  /** Like qBittorrent, unknown hashes answer 404. */
  private require(hash: string): RawTorrent {
    const t = this.torrents.get(hash);
    if (!t) throw new QbtHttpError(404, 'Not Found');
    return t;
  }

  private each(hashes: string[], fn: (hash: string, t: RawTorrent) => void) {
    for (const hash of hashes) {
      const t = this.torrents.get(hash);
      if (t) fn(hash, t);
    }
  }

  private fullSnapshot(): MaindataResponse {
    const torrents: Record<string, Partial<RawTorrent>> = {};
    for (const [hash, t] of this.torrents) torrents[hash] = { ...t };
    const trackers: Record<string, string[]> = {};
    for (const [url, hashes] of this.trackers) trackers[url] = [...hashes];
    return {
      rid: this.rid,
      full_update: true,
      torrents,
      categories: Object.fromEntries([...this.categories].map(([k, c]) => [k, { ...c }])),
      tags: [...this.tags],
      trackers,
      server_state: { ...this.serverState },
    };
  }

  private diff(): MaindataResponse {
    const res: MaindataResponse = { rid: this.rid };
    if (this.pending.size) res.torrents = Object.fromEntries(this.pending);
    if (this.pendingRemoved.length) res.torrents_removed = this.pendingRemoved;
    if (this.pendingTrackers.size) {
      res.trackers = {};
      for (const url of this.pendingTrackers) res.trackers[url] = [...this.trackers.get(url)!];
    }
    if (this.pendingCategories.size) {
      res.categories = {};
      for (const name of this.pendingCategories)
        res.categories[name] = { ...this.categories.get(name)! };
    }
    if (this.pendingCategoriesRemoved.size)
      res.categories_removed = [...this.pendingCategoriesRemoved];
    if (this.pendingTags.size) res.tags = [...this.pendingTags];
    if (this.pendingTagsRemoved.size) res.tags_removed = [...this.pendingTagsRemoved];
    res.server_state = {
      use_alt_speed_limits: this.serverState.use_alt_speed_limits,
      dl_rate_limit: this.serverState.dl_rate_limit,
      up_rate_limit: this.serverState.up_rate_limit,
      queueing: this.serverState.queueing,
      session_state: this.serverState.session_state,
      dl_info_speed: this.serverState.dl_info_speed,
      up_info_speed: this.serverState.up_info_speed,
      dl_info_data: this.serverState.dl_info_data,
      up_info_data: this.serverState.up_info_data,
      total_peer_connections: this.serverState.total_peer_connections,
      total_wasted_session: this.serverState.total_wasted_session,
      total_buffers_size: this.serverState.total_buffers_size,
      queued_io_jobs: this.serverState.queued_io_jobs,
      average_time_queue: this.serverState.average_time_queue,
      total_queued_size: this.serverState.total_queued_size,
      request_latency: this.serverState.request_latency,
      queued_tracker_announces: this.serverState.queued_tracker_announces,
      write_cache_overload: this.serverState.write_cache_overload,
    };
    return res;
  }

  private generate(now: number): RawTorrent {
    const category = faker.helpers.arrayElement([...this.categories.keys(), '', '']);
    const size = faker.number.int({ min: 5_000_000, max: 80_000_000_000 });
    const roll = faker.number.float();
    const state =
      roll < 0.05
        ? TorrentState.Downloading
        : roll < 0.08
          ? TorrentState.StalledDL
          : roll < 0.1
            ? TorrentState.StoppedDL
            : roll < 0.2
              ? TorrentState.Uploading
              : roll < 0.85
                ? TorrentState.StalledUP
                : roll < 0.995
                  ? TorrentState.StoppedUP
                  : TorrentState.Error;
    const done = !state.endsWith('DL');
    const progress = done ? 1 : faker.number.float({ min: 0, max: 0.98 });
    const addedOn = now - faker.number.int({ min: 60, max: 3 * 365 * 86_400 });
    const downloaded = Math.round(size * progress);
    const uploaded = Math.round(size * faker.number.float({ min: 0, max: done ? 8 : 0.5 }));
    const tracker = faker.helpers.arrayElement(TRACKERS);
    const savePath = this.categories.get(category)?.savePath ?? '/downloads';
    const name = torrentName(category);
    const completionOn = done ? addedOn + faker.number.int({ min: 60, max: 86_400 }) : -1;
    const timeActive = faker.number.int({ min: 0, max: now - addedOn });
    return {
      added_on: addedOn,
      amount_left: size - downloaded,
      auto_tmm: category !== '',
      availability: done ? -1 : faker.number.float({ min: 0, max: 20, fractionDigits: 3 }),
      category,
      comment: faker.datatype.boolean()
        ? `https://example.org/torrents/${faker.number.int(99999)}`
        : '',
      completed: downloaded,
      completion_on: completionOn,
      content_path: `${savePath}/${name}`,
      dl_limit: 0,
      dlspeed: 0,
      download_path: '',
      downloaded,
      downloaded_session: Math.round(downloaded * faker.number.float({ max: 0.3 })),
      eta: ETA_INFINITY,
      f_l_piece_prio: false,
      force_start: false,
      has_metadata: true,
      inactive_seeding_time_limit: -2,
      infohash_v1: '',
      infohash_v2: '',
      last_activity: now - faker.number.int({ min: 0, max: 30 * 86_400 }),
      magnet_uri: '',
      max_inactive_seeding_time: -1,
      max_ratio: -1,
      max_seeding_time: -1,
      name,
      num_complete: faker.number.int({ min: 0, max: 400 }),
      num_incomplete: faker.number.int({ min: 0, max: 60 }),
      num_leechs: 0,
      num_seeds: 0,
      popularity: faker.number.float({ max: 3, fractionDigits: 2 }),
      priority: done ? 0 : 1,
      private: tracker.startsWith('https'),
      progress,
      ratio: downloaded > 0 ? uploaded / downloaded : 0,
      ratio_limit: -2,
      reannounce: faker.number.int({ min: 60, max: 1800 }),
      root_path: '',
      save_path: savePath,
      seeding_time: done ? Math.min(timeActive, now - completionOn) : 0,
      seeding_time_limit: -2,
      seen_complete: done
        ? now
        : faker.helpers.arrayElement([0, now - faker.number.int(30 * 86_400)]),
      seq_dl: false,
      size,
      state,
      super_seeding: false,
      tags: faker.helpers.arrayElements([...this.tags], { min: 0, max: 2 }).join(', '),
      time_active: timeActive,
      total_size: size,
      tracker,
      trackers_count: 1,
      up_limit: 0,
      uploaded,
      uploaded_session: Math.round(uploaded * faker.number.float({ max: 0.3 })),
      upspeed: 0,
      share_limit_action: 'Default',
      share_limits_mode: 'Default',
      creation_date: addedOn - faker.number.int({ min: 3600, max: 90 * 86_400 }),
    };
  }

  /** Hashes of incomplete torrents in queue order; completed torrents have priority 0. */
  private queue(): string[] {
    return [...this.torrents]
      .filter(([, t]) => t.priority > 0)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([hash]) => hash);
  }

  private writeQueue(order: string[]) {
    order.forEach((hash, i) => this.set(hash, this.torrents.get(hash)!, 'priority', i + 1));
  }

  private insert(t: RawTorrent, hash = hex40()) {
    t.infohash_v1 ||= hash;
    t.magnet_uri ||= `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(t.name)}`;
    this.torrents.set(hash, t);
    this.pending.set(hash, { ...t });
    let set = this.trackers.get(t.tracker);
    if (!set) this.trackers.set(t.tracker, (set = new Set()));
    set.add(hash);
    this.pendingTrackers.add(t.tracker);
  }

  private syncTrackerIndex(hash: string) {
    const urls = new Set(this.details.realTrackerUrls(hash, this.require(hash)));
    for (const [url, hashes] of this.trackers) {
      if (hashes.has(hash) && !urls.has(url)) {
        hashes.delete(hash);
        this.pendingTrackers.add(url);
      }
    }
    for (const url of urls) {
      let hashes = this.trackers.get(url);
      if (!hashes) this.trackers.set(url, (hashes = new Set()));
      if (hashes.has(hash)) continue;
      hashes.add(hash);
      this.pendingTrackers.add(url);
    }
  }

  private remove(hash: string) {
    const t = this.torrents.get(hash);
    if (!t) return;
    this.torrents.delete(hash);
    this.pending.delete(hash);
    this.pendingRemoved.push(hash);
    for (const [url, hashes] of this.trackers) {
      if (hashes.delete(hash)) this.pendingTrackers.add(url);
    }
    if (t.priority > 0) this.writeQueue(this.queue());
  }

  private set<K extends keyof RawTorrent>(
    hash: string,
    t: RawTorrent,
    key: K,
    value: RawTorrent[K],
  ) {
    if (t[key] === value) return;
    t[key] = value;
    let d = this.pending.get(hash);
    if (!d) this.pending.set(hash, (d = {}));
    d[key] = value;
  }

  /** Advances the simulation by the wall-clock time since the last call. */
  private tick() {
    const nowMs = Date.now();
    const dt = Math.min((nowMs - this.lastTick) / 1000, 30);
    this.lastTick = nowMs;
    if (dt <= 0) return;
    const now = Math.floor(nowMs / 1000);
    let dlTotal = 0;
    let upTotal = 0;
    let peers = 0;
    const isSessionRunning = !this.serverState.session_state;

    for (const [hash, check] of this.checking) {
      const t = this.torrents.get(hash);
      if (t && nowMs >= check.until) this.set(hash, t, 'state', check.restore);
      if (!t || nowMs >= check.until) this.checking.delete(hash);
    }

    for (const [hash, t] of this.torrents) {
      // A few torrents change state each tick.
      if (Math.random() < 0.002 * dt) {
        if (t.state === TorrentState.StalledUP) this.set(hash, t, 'state', TorrentState.Uploading);
        else if (t.state === TorrentState.Uploading)
          this.set(hash, t, 'state', TorrentState.StalledUP);
        else if (t.state === TorrentState.StalledDL)
          this.set(hash, t, 'state', TorrentState.Downloading);
      }

      if (isSessionRunning && ACTIVE_DL.has(t.state)) {
        const speed = Math.round(
          faker.number.int({ min: 50_000, max: 12_000_000 }) * Math.random(),
        );
        const left = Math.max(t.size - t.downloaded - speed * dt, 0);
        const downloaded = t.size - left;
        this.set(hash, t, 'dlspeed', speed);
        this.set(hash, t, 'downloaded', Math.round(downloaded));
        this.set(hash, t, 'completed', Math.round(downloaded));
        this.set(hash, t, 'amount_left', Math.round(left));
        this.set(hash, t, 'progress', downloaded / t.size);
        this.set(hash, t, 'eta', speed > 0 ? Math.round(left / speed) : ETA_INFINITY);
        this.set(hash, t, 'num_seeds', faker.number.int({ min: 1, max: 40 }));
        this.set(hash, t, 'last_activity', now);
        if (left === 0) {
          this.set(
            hash,
            t,
            'state',
            t.force_start ? TorrentState.ForcedUP : TorrentState.Uploading,
          );
          this.set(hash, t, 'dlspeed', 0);
          this.set(hash, t, 'eta', ETA_INFINITY);
          this.set(hash, t, 'completion_on', now);
          this.set(hash, t, 'availability', -1);
          this.set(hash, t, 'priority', 0);
          this.writeQueue(this.queue());
        }
      } else if (t.dlspeed !== 0) {
        this.set(hash, t, 'dlspeed', 0);
        this.set(hash, t, 'num_seeds', 0);
      }

      if (
        isSessionRunning &&
        (ACTIVE_UP.has(t.state) || (ACTIVE_DL.has(t.state) && Math.random() < 0.5))
      ) {
        const speed = Math.round(faker.number.int({ min: 10_000, max: 4_000_000 }) * Math.random());
        const uploaded = t.uploaded + Math.round(speed * dt);
        this.set(hash, t, 'upspeed', speed);
        this.set(hash, t, 'uploaded', uploaded);
        this.set(hash, t, 'ratio', t.downloaded > 0 ? uploaded / t.downloaded : 0);
        this.set(hash, t, 'num_leechs', faker.number.int({ min: 1, max: 15 }));
        this.set(hash, t, 'last_activity', now);
      } else if (t.upspeed !== 0) {
        this.set(hash, t, 'upspeed', 0);
        this.set(hash, t, 'num_leechs', 0);
      }

      dlTotal += t.dlspeed;
      upTotal += t.upspeed;
      peers += t.num_seeds + t.num_leechs;
    }

    // Occasional churn so add/remove paths stay exercised.
    if (Math.random() < 0.05 * dt) {
      const t = this.generate(now);
      t.added_on = now;
      if (t.priority > 0) t.priority = this.queue().length + 1;
      this.insert(t);
    }
    if (this.torrents.size > 0 && Math.random() < 0.03 * dt) {
      const keys = [...this.torrents.keys()];
      this.remove(keys[Math.floor(Math.random() * keys.length)]!);
    }

    const s = this.serverState;
    s.dl_info_speed = dlTotal;
    s.up_info_speed = upTotal;
    s.dl_info_data += Math.round(dlTotal * dt);
    s.up_info_data += Math.round(upTotal * dt);
    s.total_peer_connections = peers;
    s.total_wasted_session += Math.round(dlTotal * dt * 0.002);
    s.total_buffers_size = Math.round(dlTotal / 16_384) * 16_384;
    s.queued_io_jobs = Math.floor(Math.random() * 4);
    s.average_time_queue = s.queued_io_jobs ? Math.floor(Math.random() * 30) : 0;
    s.total_queued_size = s.queued_io_jobs * 16_384;
    s.request_latency = Math.floor(Math.random() * 12);
    s.queued_tracker_announces = Math.floor(Math.random() * 3);
    s.write_cache_overload = peers ? (Math.random() * 2).toFixed(2) : '0';
  }
}
