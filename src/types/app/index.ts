import type {
  ContentLayout,
  ShareLimitAction,
  ShareLimitsMode,
  StopCondition,
  TorrentState,
} from '@/constants/qbit';

export type QueueMove = 'top' | 'up' | 'down' | 'bottom';

/**
 * Normalized torrent as the UI sees it. Instances are created once per hash and
 * updated in place by the sync engine, so unchanged torrents keep their identity.
 * They are markRaw: never reactive, never proxied.
 */
export interface Torrent {
  readonly hash: string;
  /** Bumped every time the sync engine changes this torrent. Use as a v-memo key. */
  rev: number;

  name: string;
  /** Size of the selected files. */
  size: number;
  totalSize: number;
  progress: number;
  state: TorrentState;
  dlspeed: number;
  upspeed: number;
  /** Seconds; ETA_INFINITY means unknown. */
  eta: number;
  ratio: number;
  numSeeds: number;
  numComplete: number;
  numLeechs: number;
  numIncomplete: number;
  category: string;
  tags: string[];
  addedOn: number;
  completionOn: number;
  lastActivity: number;
  savePath: string;
  contentPath: string;
  /** Incomplete-download path; empty when it isn't used. */
  downloadPath: string;
  tracker: string;
  downloaded: number;
  uploaded: number;
  amountLeft: number;
  availability: number;
  priority: number;
  private: boolean;
  autoTmm: boolean;
  forceStart: boolean;
  sequentialDownload: boolean;
  firstLastPiecePrio: boolean;
  superSeeding: boolean;
  /** Bytes/s; 0 is unlimited. */
  dlLimit: number;
  upLimit: number;
  /** LIMIT_GLOBAL, LIMIT_NONE, or a ratio. */
  ratioLimit: number;
  /** Minutes; LIMIT_GLOBAL, LIMIT_NONE, or a value. */
  seedingTimeLimit: number;
  inactiveSeedingTimeLimit: number;
  shareLimitAction: ShareLimitAction;
  shareLimitsMode: ShareLimitsMode;
  /** WebAPI 2.17+; empty otherwise. */
  error: string;
  infohashV1: string;
  infohashV2: string;
  magnetUri: string;
  comment: string;
  downloadedSession: number;
  uploadedSession: number;
  /** Bytes of the selected files already downloaded. */
  completed: number;
  /** Seconds. */
  timeActive: number;
  seedingTime: number;
  /** Effective ratio limit after the global default; negative is none. */
  maxRatio: number;
  /** Unix seconds; 0 or negative is never. */
  seenComplete: number;
  /** Seconds until the next announce. */
  reannounce: number;
  popularity: number;
  /** Unix seconds; 0 when unknown or the server is older than qBittorrent 5.2. */
  creationDate: number;

  // Derived, recomputed only when the torrent changes.
  /** Lowercased name, tracker and save path for text search. */
  searchText: string;
  isStopped: boolean;
  isComplete: boolean;
  isErrored: boolean;
  isChecking: boolean;
  isStalled: boolean;
  /** Has transfer activity right now. */
  isActive: boolean;
}

export interface Category {
  name: string;
  savePath: string;
  /** Absent when the server doesn't report category share limits. */
  shareLimits?: ShareLimits;
}

export interface CategoryOptions {
  savePath: string;
  /** WebAPI 2.16.2+. */
  shareLimits?: ShareLimits;
}

export interface AddTorrentOptions {
  /** Magnet links and http(s) URLs. */
  urls: string[];
  files: File[];
  /** Empty: qBittorrent's default save path. */
  savePath: string;
  /** Empty: no category. */
  category: string;
  tags: string[];
  stopped: boolean;
  sequential: boolean;
  firstLastPiecePrio: boolean;
  skipChecking: boolean;
  /** Empty: keep the torrent's own name. */
  rename?: string;
  /** One FilePriority per file, in file order. Needs exactly one URL whose metadata qBittorrent already holds. */
  filePriorities?: number[];
  /** Undefined leaves each of these to qBittorrent's preferences. */
  autoTmm?: boolean;
  contentLayout?: ContentLayout;
  stopCondition?: StopCondition;
  addToTopOfQueue?: boolean;
  useDownloadPath?: boolean;
  /** Empty with useDownloadPath: qBittorrent's default incomplete path. */
  downloadPath?: string;
  /** Bytes/s; 0: no limit. */
  dlLimit?: number;
  upLimit?: number;
  shareLimits?: ShareLimits;
  /** WebAPI 2.13.1+. A search plugin that fetches the http(s) URLs. */
  downloader?: string;
}

export interface MetadataFile {
  /** '/'-separated, relative to the torrent root. */
  path: string;
  size: number;
  /** A FilePriority; DoNotDownload when qBittorrent's excluded file names match (WebAPI 2.16.0+). */
  priority: number;
}

export interface TorrentMetadata {
  infoHashV1: string;
  infoHashV2: string;
  name: string;
  size: number;
  files: MetadataFile[];
  isPrivate: boolean;
  comment: string;
}

export type MetadataLookup =
  | { status: 'pending'; infoHashV1: string; infoHashV2: string }
  | { status: 'ready'; metadata: TorrentMetadata };

export interface ShareLimits {
  /** LIMIT_GLOBAL, LIMIT_NONE, or a ratio. */
  ratioLimit: number;
  /** Minutes; LIMIT_GLOBAL, LIMIT_NONE, or a value. */
  seedingTimeLimit: number;
  inactiveSeedingTimeLimit: number;
  action: ShareLimitAction;
  mode: ShareLimitsMode;
}

export interface TrackerChanges {
  newUrl?: string;
  tier?: number;
}

export interface AddTorrentResult {
  /** False when nothing was added. */
  ok: boolean;
  /** Torrents qBittorrent rejected (WebAPI 2.14+ reports this; older versions don't). */
  failed: number;
}

export type TorrentFormat = 'v1' | 'v2' | 'hybrid';

export type TorrentCreationStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface TorrentCreationTask {
  id: string;
  sourcePath: string;
  status: TorrentCreationStatus;
  /** 0–1. */
  progress: number;
  /** Bytes; 0 means automatic and the task hasn't finished yet. */
  pieceSize: number;
  isPrivate: boolean;
  /** Undefined on libtorrent 1.2 builds. */
  format?: TorrentFormat;
  /** Undefined before WebAPI 2.16.0. */
  ignoreDotfiles?: boolean;
  /** Unix seconds; null when unknown or not reached yet. */
  addedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  comment: string;
  source: string;
  /** An empty entry separates tracker tiers. */
  trackers: string[];
  webSeeds: string[];
  /** Empty when qBittorrent keeps the file only for torrentcreator/torrentFile. */
  torrentFilePath: string;
  error: string;
}

export interface NewTorrentOptions {
  /** A file or folder on the qBittorrent host. */
  sourcePath: string;
  /** Empty: qBittorrent keeps the file only for downloading it from the task. */
  torrentFilePath: string;
  /** Bytes; 0 lets libtorrent pick. */
  pieceSize: number;
  isPrivate: boolean;
  startSeeding: boolean;
  /** libtorrent 2 builds only. */
  format?: TorrentFormat;
  /** libtorrent 1.2 builds only. */
  optimizeAlignment?: boolean;
  /** libtorrent 1.2 builds only. Bytes; -1 pads no file by size. */
  paddedFileSizeLimit?: number;
  /** WebAPI 2.16.0+. */
  ignoreDotfiles?: boolean;
  comment: string;
  source: string;
  /** An empty entry starts the next tracker tier. */
  trackers: string[];
  webSeeds: string[];
}

/** Every plugin, the enabled ones, or these by name. */
export type SearchPluginScope = 'all' | 'enabled' | string[];

export interface SearchJob {
  id: number;
  isRunning: boolean;
  total: number;
  /** Null before WebAPI 2.16.1 unless this browser started the search. */
  pattern: string | null;
  category: string | null;
  plugins: string[] | null;
}

export interface SearchResult {
  /** Position in qBittorrent's result list, unique within a job. */
  index: number;
  name: string;
  url: string;
  /** Bytes; null when unknown. */
  size: number | null;
  seeds: number | null;
  leechers: number | null;
  /** Plugin name, the `downloader` for torrents/add. */
  engine: string;
  /** Empty before WebAPI 2.17.0; look the plugin up instead. */
  engineFullName: string;
  siteUrl: string;
  descriptionUrl: string;
  /** Unix seconds; null when unknown. */
  publishedAt: number | null;
}

export interface SearchResultsPage {
  isRunning: boolean;
  total: number;
  results: SearchResult[];
}

export interface SearchPlugin {
  name: string;
  fullName: string;
  version: string;
  url: string;
  isEnabled: boolean;
  /** Without the implicit `all`. */
  categories: { id: string; name: string }[];
}
