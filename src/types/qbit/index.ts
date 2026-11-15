// Raw WebAPI shapes, exactly as returned by qBittorrent 5.0+ (WebAPI 2.11+).
// Reference: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)

import type { ConnectionStatus, TorrentState } from '@/constants/qbit';

/** One entry of `sync/maindata`'s `torrents` map (hash is the map key, not a field). */
export interface RawTorrent {
  added_on: number;
  amount_left: number;
  auto_tmm: boolean;
  availability: number;
  category: string;
  comment: string;
  completed: number;
  completion_on: number;
  content_path: string;
  dl_limit: number;
  dlspeed: number;
  download_path: string;
  downloaded: number;
  downloaded_session: number;
  eta: number;
  f_l_piece_prio: boolean;
  force_start: boolean;
  has_metadata: boolean;
  inactive_seeding_time_limit: number;
  infohash_v1: string;
  infohash_v2: string;
  last_activity: number;
  magnet_uri: string;
  max_inactive_seeding_time: number;
  max_ratio: number;
  max_seeding_time: number;
  name: string;
  num_complete: number;
  num_incomplete: number;
  num_leechs: number;
  num_seeds: number;
  popularity: number;
  priority: number;
  /** Null until the metadata arrives. */
  private: boolean | null;
  progress: number;
  ratio: number;
  ratio_limit: number;
  reannounce: number;
  root_path: string;
  save_path: string;
  seeding_time: number;
  seeding_time_limit: number;
  seen_complete: number;
  seq_dl: boolean;
  size: number;
  state: TorrentState;
  super_seeding: boolean;
  /** Comma-separated, e.g. `"linux, iso"`. */
  tags: string;
  time_active: number;
  total_size: number;
  tracker: string;
  trackers_count: number;
  up_limit: number;
  uploaded: number;
  uploaded_session: number;
  upspeed: number;
  /** WebAPI 2.12+: a ShareLimitAction string. Normalized in sync/normalize.ts. */
  share_limit_action?: string | number;
  /** WebAPI 2.15.3+ */
  share_limits_mode?: string;
  /** WebAPI 2.17+: why the torrent is in an error state. */
  error?: string;
  /** qBittorrent 5.2+; 0 when the torrent file has no creation date. */
  creation_date?: number;
}

export interface RawServerState {
  alltime_dl: number;
  alltime_ul: number;
  /** Milliseconds. */
  average_time_queue: number;
  connection_status: ConnectionStatus;
  dht_nodes: number;
  dl_info_data: number;
  dl_info_speed: number;
  dl_rate_limit: number;
  free_space_on_disk: number;
  /** Two decimals, or "-" before anything was transferred. */
  global_ratio: string;
  /** Empty until qBittorrent has learned it. Not in the WebAPI changelog, so gate on key presence. */
  last_external_address_v4?: string;
  last_external_address_v6?: string;
  queued_io_jobs: number;
  /** WebAPI 2.16.0+ */
  queued_tracker_announces?: number;
  queueing: boolean;
  /** Percentages as two-decimal strings. */
  read_cache_hits: string;
  read_cache_overload: string;
  refresh_interval: number;
  /** Milliseconds. WebAPI 2.16.0+ */
  request_latency?: number;
  /** True while the whole session is paused. WebAPI 2.16.2+. */
  session_state: boolean;
  total_buffers_size: number;
  total_peer_connections: number;
  total_queued_size: number;
  total_wasted_session: number;
  up_info_data: number;
  up_info_speed: number;
  up_rate_limit: number;
  use_alt_speed_limits: boolean;
  use_subcategories: boolean;
  write_cache_overload: string;
}

/** app/processInfo, WebAPI 2.15.1+. */
export interface RawProcessInfo {
  /** Unix seconds. */
  launch_time: number;
}

/** Global limits in bytes/s; 0 is unlimited. transfer/getSpeedLimits (WebAPI 2.16.0+) or the same preference keys. */
export interface RawSpeedLimits {
  dl_limit: number;
  up_limit: number;
  alt_dl_limit: number;
  alt_up_limit: number;
}

/** app/cookies, WebAPI 2.11.4+. */
export interface RawCookie {
  name: string;
  domain: string;
  path: string;
  value: string;
  /** Unix seconds; -1 for a session cookie, which qBittorrent drops when it restarts. */
  expirationDate: number;
}

/** app/setCookies entry; without `expirationDate` it's a session cookie. */
export type NewCookie = Omit<RawCookie, 'expirationDate'> & { expirationDate?: number };

export interface RawCategory {
  name: string;
  savePath: string;
  download_path?: string | null;
  ratio_limit?: number;
  seeding_time_limit?: number;
  inactive_seeding_time_limit?: number;
  share_limit_action?: string;
  share_limits_mode?: string;
}

export interface MaindataResponse {
  rid: number;
  full_update?: boolean;
  torrents?: Record<string, Partial<RawTorrent>>;
  torrents_removed?: string[];
  categories?: Record<string, Partial<RawCategory>>;
  categories_removed?: string[];
  tags?: string[];
  tags_removed?: string[];
  /** Tracker URL → hashes of torrents using it. */
  trackers?: Record<string, string[]>;
  trackers_removed?: string[];
  server_state?: Partial<RawServerState>;
}

/** torrents/properties */
export interface RawTorrentProperties {
  addition_date: number;
  comment: string;
  completion_date: number;
  created_by: string;
  creation_date: number;
  dl_limit: number;
  dl_speed: number;
  dl_speed_avg: number;
  download_path: string;
  eta: number;
  hash: string;
  infohash_v1: string;
  infohash_v2: string;
  /** 5.0+; older builds used `isPrivate`. */
  is_private?: boolean;
  isPrivate?: boolean;
  last_seen: number;
  name: string;
  nb_connections: number;
  nb_connections_limit: number;
  peers: number;
  peers_total: number;
  piece_size: number;
  pieces_have: number;
  pieces_num: number;
  reannounce: number;
  save_path: string;
  seeding_time: number;
  seeds: number;
  seeds_total: number;
  share_ratio: number;
  time_elapsed: number;
  total_downloaded: number;
  total_downloaded_session: number;
  total_size: number;
  total_uploaded: number;
  total_uploaded_session: number;
  total_wasted: number;
  up_limit: number;
  up_speed: number;
  up_speed_avg: number;
}

/** torrents/trackers entry. The first three entries are DHT, PeX and LSD pseudo-trackers. */
export interface RawTracker {
  url: string;
  status: number;
  tier: number;
  num_peers: number;
  num_seeds: number;
  num_leeches: number;
  num_downloaded: number;
  msg: string;
}

/** torrents/webseeds entry. */
export interface RawWebSeed {
  url: string;
}

/** torrents/fetchMetadata and parseMetadata result. Only the hashes while a lookup is pending. */
export interface RawTorrentMetadata {
  infohash_v1?: string;
  infohash_v2?: string;
  info?: {
    files?: { path: string; length: number; priority?: number }[];
    length?: number;
    name?: string;
    private?: boolean;
  };
  comment?: string;
  created_by?: string;
  creation_date?: number;
}

/** torrents/files entry. */
export interface RawTorrentFile {
  index: number;
  /** Path inside the torrent, '/'-separated. */
  name: string;
  size: number;
  progress: number;
  priority: number;
  is_seed?: boolean;
  piece_range: [number, number];
  availability: number;
}

export interface RawPeer {
  client: string;
  connection: string;
  country: string;
  country_code: string;
  dl_speed: number;
  downloaded: number;
  files: string;
  flags: string;
  flags_desc: string;
  /** WebAPI 2.15.1+; empty unless "Resolve peer host names" is on. */
  host_name?: string;
  ip: string;
  port: number;
  progress: number;
  relevance: number;
  up_speed: number;
  uploaded: number;
}

/** sync/torrentPeers: a diff against `rid`, keyed by "ip:port". */
export interface PeersResponse {
  rid: number;
  full_update?: boolean;
  peers?: Record<string, Partial<RawPeer>>;
  peers_removed?: string[];
  show_flags?: boolean;
}

/**
 * app/preferences: only the keys this UI edits. qBittorrent returns many more;
 * setPreferences accepts any subset.
 */
export interface RawPreferences {
  save_path: string;
  temp_path_enabled: boolean;
  temp_path: string;
  add_stopped_enabled?: boolean;
  preallocate_all: boolean;
  incomplete_files_ext: boolean;
  auto_tmm_enabled: boolean;
  merge_trackers?: boolean;
  listen_port: number;
  upnp: boolean;
  max_connec: number;
  max_connec_per_torrent: number;
  max_uploads: number;
  max_uploads_per_torrent: number;
  dl_limit: number;
  up_limit: number;
  alt_dl_limit: number;
  alt_up_limit: number;
  dht: boolean;
  pex: boolean;
  lsd: boolean;
  /** 0 prefer, 1 force on, 2 force off. */
  encryption: number;
  anonymous_mode: boolean;
  queueing_enabled: boolean;
  max_active_downloads: number;
  max_active_uploads: number;
  max_active_torrents: number;
  dont_count_slow_torrents: boolean;
  max_ratio_enabled?: boolean;
  max_ratio: number;
  max_seeding_time_enabled?: boolean;
  /** Minutes. */
  max_seeding_time: number;
  /** Number (older) or ShareLimitAction string (newer); see sync/normalize.ts. */
  max_ratio_act: number | string;
  [key: string]: unknown;
}

/** app/networkInterfaceList entry. */
export interface RawNetworkInterface {
  name: string;
  value: string;
}

/** log/main entry. */
export interface RawLogEntry {
  id: number;
  message: string;
  /** Unix seconds. */
  timestamp: number;
  /** A LogType flag. */
  type: number;
}

/** log/peers entry. */
export interface RawPeerLogEntry {
  id: number;
  ip: string;
  /** Unix seconds. */
  timestamp: number;
  /** True when the IP filter blocked the peer, false when it was banned. */
  blocked: boolean;
  reason: string;
}

/** rss/items article. Every field but `id` can be missing when the feed omits it. */
export interface RawRssArticle {
  id: string;
  title?: string;
  /** RFC 2822 or ISO 8601. */
  date?: string;
  author?: string;
  link?: string;
  /** HTML from the feed. */
  description?: string;
  torrentURL?: string;
  isRead?: boolean;
  category?: string;
}

/** rss/items feed; `articles` only with `withData=true`. */
export interface RawRssFeed {
  uid: string;
  url: string;
  title?: string;
  lastBuildDate?: string;
  isLoading?: boolean;
  hasError?: boolean;
  /** Seconds; 0 follows `rss_refresh_interval`. Not every version sends it. */
  refreshInterval?: number;
  articles?: RawRssArticle[];
}

/** rss/items: folders nest by name, and a child with a `uid` is a feed. */
export interface RawRssFolder {
  [name: string]: RawRssFeed | RawRssFolder;
}

/** AddTorrentParams as qBittorrent serializes it inside a rule; absent keys use the defaults. */
export interface RawRssTorrentParams {
  category?: string;
  tags?: string[];
  save_path?: string;
  use_auto_tmm?: boolean;
  stopped?: boolean | null;
  content_layout?: string | null;
  [key: string]: unknown;
}

/** rss/rules value. Unknown keys must survive a round trip through rss/setRule. */
export interface RawRssRule {
  enabled?: boolean;
  priority?: number;
  useRegex?: boolean;
  mustContain?: string;
  mustNotContain?: string;
  episodeFilter?: string;
  affectedFeeds?: string[];
  ignoreDays?: number;
  lastMatch?: string;
  smartFilter?: boolean;
  previouslyMatchedEpisodes?: string[];
  torrentParams?: RawRssTorrentParams;
  [key: string]: unknown;
}

/** app/buildInfo. */
export interface RawBuildInfo {
  qt: string;
  libtorrent: string;
  boost: string;
  openssl: string;
  zlib: string;
  bitness: number;
  platform?: string;
}

export type RawTorrentCreationStatus = 'Queued' | 'Running' | 'Finished' | 'Failed';

/** torrentcreator/status entry. Optional text and list keys are left out while empty. */
export interface RawTorrentCreationTask {
  taskID: string;
  sourcePath: string;
  /** Bytes. 0 (automatic) until the task finishes, then the size libtorrent picked. */
  pieceSize: number;
  /** WebAPI 2.16.0+. */
  ignoreDotfiles?: boolean;
  private: boolean;
  /** libtorrent 2 builds only. */
  format?: 'v1' | 'v2' | 'hybrid';
  /** libtorrent 1.2 builds only. */
  optimizeAlignment?: boolean;
  /** libtorrent 1.2 builds only. Bytes; -1 pads no file by size. */
  paddedFileSizeLimit?: number;
  status: RawTorrentCreationStatus;
  /** Unix seconds from WebAPI 2.16.0; before that Qt's text date in the host's time zone. */
  timeAdded: number | string;
  timeStarted?: number | string;
  timeFinished?: number | string;
  comment?: string;
  torrentFilePath?: string;
  source?: string;
  trackers?: string[];
  urlSeeds?: string[];
  errorMessage?: string;
  /** Percent, only while running. */
  progress?: number;
}

/** search/status entry. pattern, category and plugins from WebAPI 2.16.1. */
export interface RawSearchJob {
  id: number;
  status: 'Running' | 'Stopped';
  total: number;
  pattern?: string;
  category?: string;
  plugins?: string[];
}

/** search/results entry. */
export interface RawSearchResult {
  fileName: string;
  /** A magnet link or a URL only the plugin may be able to fetch. */
  fileUrl: string;
  /** Bytes; -1 when the plugin doesn't know. */
  fileSize: number;
  /** -1 when the plugin doesn't know. */
  nbSeeders: number;
  nbLeechers: number;
  /** The plugin's internal name. */
  engineName: string;
  /** WebAPI 2.17.0+. */
  engineFullName?: string;
  siteUrl: string;
  /** Untrusted plugin output: only open http(s) links. */
  descrLink: string;
  /** Unix seconds; 0 or negative when the plugin doesn't know. */
  pubDate: number;
}

export interface RawSearchResults {
  status: 'Running' | 'Stopped';
  results: RawSearchResult[];
  total: number;
}

/** search/plugins entry. */
export interface RawSearchPlugin {
  name: string;
  fullName: string;
  version: string;
  url: string;
  enabled: boolean;
  /** Starts with `all`. */
  supportedCategories: { id: string; name: string }[];
}
