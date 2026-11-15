// Raw → app conversion and version adapters. Pure functions; the only Vue import is
// markRaw, so a torrent placed in a ref() later can never become deep-reactive.

import { markRaw } from 'vue';
import {
  API,
  ConnectionStatus,
  ETA_INFINITY,
  FilePriority,
  LIMIT_GLOBAL,
  ShareLimitAction,
  ShareLimitsMode,
  TorrentState,
} from '@/constants/qbit';
import { compareVersions } from '@/lib/version';
import type {
  RawCategory,
  RawSearchJob,
  RawSearchPlugin,
  RawSearchResults,
  RawServerState,
  RawTorrent,
  RawTorrentCreationTask,
  RawTorrentMetadata,
} from '@/types/qbit';
import type {
  Category,
  MetadataLookup,
  NewTorrentOptions,
  SearchJob,
  SearchPlugin,
  SearchResultsPage,
  ShareLimits,
  Torrent,
  TorrentCreationTask,
  TorrentMetadata,
} from '@/types/app';
import { searchText } from '@/lib/torrentFilters';

/** Fills fields a partial "new torrent" entry might lack, so app objects never hold undefined. */
export const DEFAULT_RAW_TORRENT: RawTorrent = {
  added_on: 0,
  amount_left: 0,
  auto_tmm: false,
  availability: 0,
  category: '',
  comment: '',
  completed: 0,
  completion_on: 0,
  content_path: '',
  dl_limit: 0,
  dlspeed: 0,
  download_path: '',
  downloaded: 0,
  downloaded_session: 0,
  eta: ETA_INFINITY,
  f_l_piece_prio: false,
  force_start: false,
  has_metadata: true,
  inactive_seeding_time_limit: -2,
  infohash_v1: '',
  infohash_v2: '',
  last_activity: 0,
  magnet_uri: '',
  max_inactive_seeding_time: -1,
  max_ratio: -1,
  max_seeding_time: -1,
  name: '',
  num_complete: 0,
  num_incomplete: 0,
  num_leechs: 0,
  num_seeds: 0,
  popularity: 0,
  priority: 0,
  private: false,
  progress: 0,
  ratio: 0,
  ratio_limit: -2,
  reannounce: 0,
  root_path: '',
  save_path: '',
  seeding_time: 0,
  seeding_time_limit: -2,
  seen_complete: 0,
  seq_dl: false,
  size: 0,
  state: TorrentState.Unknown,
  super_seeding: false,
  tags: '',
  time_active: 0,
  total_size: 0,
  tracker: '',
  trackers_count: 0,
  up_limit: 0,
  uploaded: 0,
  uploaded_session: 0,
  upspeed: 0,
};

export const DEFAULT_SERVER_STATE: RawServerState = {
  alltime_dl: 0,
  alltime_ul: 0,
  average_time_queue: 0,
  connection_status: ConnectionStatus.Disconnected,
  dht_nodes: 0,
  dl_info_data: 0,
  dl_info_speed: 0,
  dl_rate_limit: 0,
  free_space_on_disk: 0,
  global_ratio: '0',
  queued_io_jobs: 0,
  queueing: false,
  read_cache_hits: '0',
  read_cache_overload: '0',
  refresh_interval: 1500,
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

const STOPPED = new Set<string>([TorrentState.StoppedDL, TorrentState.StoppedUP]);
const ERRORED = new Set<string>([TorrentState.Error, TorrentState.MissingFiles]);
const CHECKING = new Set<string>([
  TorrentState.CheckingDL,
  TorrentState.CheckingUP,
  TorrentState.CheckingResumeData,
]);
const STALLED = new Set<string>([TorrentState.StalledDL, TorrentState.StalledUP]);

export function parseTags(tags: string): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Writes every app field of `t` from the complete raw record. */
function writeFields(t: Torrent, raw: RawTorrent): void {
  if (
    t.searchText === undefined ||
    t.name !== raw.name ||
    t.tracker !== raw.tracker ||
    t.savePath !== raw.save_path
  ) {
    t.searchText = searchText({ name: raw.name, tracker: raw.tracker, savePath: raw.save_path });
  }
  t.name = raw.name;
  t.size = raw.size;
  t.totalSize = raw.total_size;
  t.progress = raw.progress;
  t.state = raw.state;
  t.dlspeed = raw.dlspeed;
  t.upspeed = raw.upspeed;
  t.eta = raw.eta;
  t.ratio = raw.ratio;
  t.numSeeds = raw.num_seeds;
  t.numComplete = raw.num_complete;
  t.numLeechs = raw.num_leechs;
  t.numIncomplete = raw.num_incomplete;
  t.category = raw.category;
  t.tags = parseTags(raw.tags);
  t.addedOn = raw.added_on;
  t.completionOn = raw.completion_on;
  t.lastActivity = raw.last_activity;
  t.savePath = raw.save_path;
  t.contentPath = raw.content_path;
  t.downloadPath = raw.download_path;
  t.tracker = raw.tracker;
  t.downloaded = raw.downloaded;
  t.uploaded = raw.uploaded;
  t.amountLeft = raw.amount_left;
  t.availability = raw.availability;
  t.priority = raw.priority;
  t.private = raw.private === true;
  t.autoTmm = raw.auto_tmm;
  t.forceStart = raw.force_start;
  t.sequentialDownload = raw.seq_dl;
  t.firstLastPiecePrio = raw.f_l_piece_prio;
  t.superSeeding = raw.super_seeding;
  t.dlLimit = raw.dl_limit;
  t.upLimit = raw.up_limit;
  t.ratioLimit = raw.ratio_limit;
  t.seedingTimeLimit = raw.seeding_time_limit;
  t.inactiveSeedingTimeLimit = raw.inactive_seeding_time_limit;
  t.shareLimitAction = normalizeShareLimitAction(raw.share_limit_action);
  t.shareLimitsMode = normalizeShareLimitsMode(raw.share_limits_mode);
  t.error = raw.error ?? '';
  t.infohashV1 = raw.infohash_v1;
  t.infohashV2 = raw.infohash_v2;
  t.magnetUri = raw.magnet_uri;
  t.comment = raw.comment;
  t.downloadedSession = raw.downloaded_session;
  t.uploadedSession = raw.uploaded_session;
  t.completed = raw.completed;
  t.timeActive = raw.time_active;
  t.seedingTime = raw.seeding_time;
  t.maxRatio = raw.max_ratio;
  t.seenComplete = raw.seen_complete;
  t.reannounce = raw.reannounce;
  t.popularity = raw.popularity;
  t.creationDate = raw.creation_date ?? 0;

  t.isStopped = STOPPED.has(raw.state);
  t.isComplete = raw.progress >= 1;
  t.isErrored = ERRORED.has(raw.state);
  t.isChecking = CHECKING.has(raw.state);
  t.isStalled = STALLED.has(raw.state);
  t.isActive = raw.dlspeed > 0 || raw.upspeed > 0;
}

/** Creates the app object for a new hash. `raw` must be complete (merged over defaults). */
export function createTorrent(hash: string, raw: RawTorrent): Torrent {
  const t = { hash, rev: 0 } as Torrent;
  writeFields(t, raw);
  return markRaw(t);
}

/** Updates an existing app object in place and bumps its rev. */
export function updateTorrent(t: Torrent, raw: RawTorrent): void {
  writeFields(t, raw);
  t.rev++;
}

// ---- Version adapters ------------------------------------------------------

const ACTIONS = new Set<string>(Object.values(ShareLimitAction));
const MODES = new Set<string>(Object.values(ShareLimitsMode));

/**
 * Share limit actions arrive as strings (WebAPI 2.12+) or as qBittorrent's old
 * MaxRatioAction numbers (preferences before the switch): 0 Stop, 1 Remove,
 * 2 EnableSuperSeeding, 3 RemoveWithContent. Anything else means "use global".
 */
export function normalizeShareLimitAction(value: unknown): ShareLimitAction {
  if (typeof value === 'string' && ACTIONS.has(value)) return value as ShareLimitAction;
  switch (value) {
    case 0:
      return ShareLimitAction.Stop;
    case 1:
      return ShareLimitAction.Remove;
    case 2:
      return ShareLimitAction.EnableSuperSeeding;
    case 3:
      return ShareLimitAction.RemoveWithContent;
    default:
      return ShareLimitAction.Default;
  }
}

export function normalizeShareLimitsMode(value: unknown): ShareLimitsMode {
  return typeof value === 'string' && MODES.has(value)
    ? (value as ShareLimitsMode)
    : ShareLimitsMode.Default;
}

export function apiAtLeast(apiVersion: string | null, min: string): boolean {
  return apiVersion !== null && compareVersions(apiVersion, min) >= 0;
}

/** torrents/setShareLimits form for the running WebAPI version. */
export function shareLimitsForm(
  hashes: string,
  limits: ShareLimits,
  apiVersion: string | null,
): Record<string, string | number> {
  return { hashes, ...shareLimitsFields(limits, apiVersion) };
}

export function shareLimitsFields(
  limits: ShareLimits,
  apiVersion: string | null,
): Record<string, string | number> {
  const form: Record<string, string | number> = {
    ratioLimit: limits.ratioLimit,
    seedingTimeLimit: limits.seedingTimeLimit,
    inactiveSeedingTimeLimit: limits.inactiveSeedingTimeLimit,
  };
  if (apiAtLeast(apiVersion, API.shareLimitAction)) form.shareLimitAction = limits.action;
  if (apiAtLeast(apiVersion, API.shareLimitsMode)) form.shareLimitsMode = limits.mode;
  return form;
}

export function normalizeCategory(raw: RawCategory): Category {
  const category: Category = { name: raw.name, savePath: raw.savePath ?? '' };
  if (raw.ratio_limit !== undefined)
    category.shareLimits = {
      ratioLimit: raw.ratio_limit,
      seedingTimeLimit: raw.seeding_time_limit ?? LIMIT_GLOBAL,
      inactiveSeedingTimeLimit: raw.inactive_seeding_time_limit ?? LIMIT_GLOBAL,
      action: normalizeShareLimitAction(raw.share_limit_action),
      mode: normalizeShareLimitsMode(raw.share_limits_mode),
    };
  return category;
}

export function normalizeMetadata(raw: RawTorrentMetadata): TorrentMetadata {
  const files = (raw.info?.files ?? []).map((file) => ({
    path: file.path,
    size: file.length,
    priority: file.priority ?? FilePriority.Normal,
  }));
  return {
    infoHashV1: raw.infohash_v1 ?? '',
    infoHashV2: raw.infohash_v2 ?? '',
    name: raw.info?.name ?? '',
    size: raw.info?.length ?? files.reduce((sum, file) => sum + file.size, 0),
    files,
    isPrivate: raw.info?.private ?? false,
    comment: raw.comment ?? '',
  };
}

/** fetchMetadata answers 202 with the hashes (or nothing, for an http URL) until the metadata arrives. */
export function normalizeMetadataLookup(
  isComplete: boolean,
  raw: RawTorrentMetadata,
): MetadataLookup {
  if (isComplete && raw.info) return { status: 'ready', metadata: normalizeMetadata(raw) };
  return {
    status: 'pending',
    infoHashV1: raw.infohash_v1 ?? '',
    infoHashV2: raw.infohash_v2 ?? '',
  };
}

/** parseMetadata answers an array, or an object keyed by file name on builds before the array change. */
export function firstParsedMetadata(body: unknown): RawTorrentMetadata | null {
  const entries = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? Object.values(body)
      : [];
  return (entries[0] as RawTorrentMetadata | undefined) ?? null;
}

const QT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Qt's TextDate in the host's time zone, read in the browser's: "Thu Nov 13 09:05:01 2026" or "Thu Nov 13 2026 09:05:01". */
export function parseQtTextDate(text: string): number | null {
  const match =
    /^[A-Za-z]{3} ([A-Za-z]{3}) +(\d{1,2}) (?:(\d{1,2}):(\d{2}):(\d{2}) (\d{4})|(\d{4}) (\d{1,2}):(\d{2}):(\d{2}))/.exec(
      text.trim(),
    );
  if (!match) return null;
  const month = QT_MONTHS.indexOf(match[1]!);
  if (month < 0) return null;
  const [year, hours, minutes, seconds] = match[6]
    ? [match[6], match[3], match[4], match[5]]
    : [match[7], match[8], match[9], match[10]];
  const date = new Date(
    Number(year),
    month,
    Number(match[2]),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function creationTime(value: number | string | undefined): number | null {
  if (value === undefined || value === '') return null;
  if (typeof value === 'number') return value > 0 ? value : null;
  return parseQtTextDate(value);
}

const CREATION_STATUSES = {
  Queued: 'queued',
  Running: 'running',
  Finished: 'finished',
  Failed: 'failed',
} as const;

export function normalizeCreationTask(raw: RawTorrentCreationTask): TorrentCreationTask {
  const status = CREATION_STATUSES[raw.status] ?? 'queued';
  return {
    id: raw.taskID,
    sourcePath: raw.sourcePath,
    status,
    progress: status === 'finished' ? 1 : Math.min(1, Math.max(0, (raw.progress ?? 0) / 100)),
    pieceSize: raw.pieceSize,
    isPrivate: raw.private,
    format: raw.format,
    ignoreDotfiles: raw.ignoreDotfiles,
    addedAt: creationTime(raw.timeAdded),
    startedAt: creationTime(raw.timeStarted),
    finishedAt: creationTime(raw.timeFinished),
    comment: raw.comment ?? '',
    source: raw.source ?? '',
    trackers: raw.trackers ?? [],
    webSeeds: (raw.urlSeeds ?? []).filter(Boolean),
    torrentFilePath: raw.torrentFilePath ?? '',
    error: raw.errorMessage ?? '',
  };
}

/** torrentcreator/addTask form for the running WebAPI version. */
export function creationTaskForm(
  options: NewTorrentOptions,
  apiVersion: string | null,
): Record<string, string | number | boolean> {
  const joinUrls = apiAtLeast(apiVersion, API.creatorDecodesUrls)
    ? (urls: string[]) => urls.map(encodeURIComponent).join('|')
    : (urls: string[]) => urls.join('|');
  const form: Record<string, string | number | boolean> = {
    sourcePath: options.sourcePath,
    pieceSize: options.pieceSize,
    private: options.isPrivate,
    startSeeding: options.startSeeding,
    comment: options.comment,
    source: options.source,
    trackers: joinUrls(options.trackers),
    urlSeeds: joinUrls(options.webSeeds),
  };
  if (options.torrentFilePath) form.torrentFilePath = options.torrentFilePath;
  if (options.format) form.format = options.format;
  if (options.optimizeAlignment !== undefined) form.optimizeAlignment = options.optimizeAlignment;
  if (options.paddedFileSizeLimit !== undefined)
    form.paddedFileSizeLimit = options.paddedFileSizeLimit;
  if (options.ignoreDotfiles !== undefined && apiAtLeast(apiVersion, API.creatorIgnoreDotfiles))
    form.ignoreDotfiles = options.ignoreDotfiles;
  return form;
}

export function normalizeSearchJob(raw: RawSearchJob): SearchJob {
  return {
    id: raw.id,
    isRunning: raw.status === 'Running',
    total: raw.total,
    pattern: raw.pattern ?? null,
    category: raw.category ?? null,
    plugins: raw.plugins ?? null,
  };
}

const knownOrNull = (value: number) => (value >= 0 ? value : null);

/** `offset` is where this page starts in the job's result list. */
export function normalizeSearchResults(raw: RawSearchResults, offset: number): SearchResultsPage {
  return {
    isRunning: raw.status === 'Running',
    total: raw.total,
    results: raw.results.map((result, i) => ({
      index: offset + i,
      name: result.fileName,
      url: result.fileUrl,
      size: knownOrNull(result.fileSize),
      seeds: knownOrNull(result.nbSeeders),
      leechers: knownOrNull(result.nbLeechers),
      engine: result.engineName,
      engineFullName: result.engineFullName ?? '',
      siteUrl: result.siteUrl,
      descriptionUrl: result.descrLink,
      publishedAt: result.pubDate > 0 ? result.pubDate : null,
    })),
  };
}

export function normalizeSearchPlugin(raw: RawSearchPlugin): SearchPlugin {
  return {
    name: raw.name,
    fullName: raw.fullName || raw.name,
    version: raw.version,
    url: raw.url,
    isEnabled: raw.enabled,
    categories: raw.supportedCategories.filter((category) => category.id !== 'all'),
  };
}
