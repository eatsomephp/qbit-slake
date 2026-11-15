import type {
  MaindataResponse,
  PeersResponse,
  RawLogEntry,
  RawPeerLogEntry,
  RawBuildInfo,
  RawCookie,
  NewCookie,
  RawNetworkInterface,
  RawProcessInfo,
  RawPreferences,
  RawSpeedLimits,
  RawRssFolder,
  RawRssRule,
  RawTorrentFile,
  RawTorrentProperties,
  RawTracker,
  RawWebSeed,
} from '@/types/qbit';
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
  TorrentCreationTask,
  TorrentMetadata,
  QueueMove,
  ShareLimits,
  TrackerChanges,
} from '@/types/app';

/** Every WebAPI call the app makes. Grows milestone by milestone. */
export interface IProvider {
  /** Resolves true when qBittorrent answers `Ok.`. */
  login(username: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
  shutdown(): Promise<void>;
  /** qBittorrent version without a leading `v`, e.g. `5.1.2`. */
  getVersion(): Promise<string>;
  getWebApiVersion(): Promise<string>;
  getMaindata(rid: number, signal?: AbortSignal): Promise<MaindataResponse>;

  // Torrent actions. `hashes` is never empty; callers pass explicit hashes, never "all".
  startTorrents(hashes: string[]): Promise<void>;
  stopTorrents(hashes: string[]): Promise<void>;
  deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void>;
  recheckTorrents(hashes: string[]): Promise<void>;
  /** `trackerUrls` limits it to those trackers (WebAPI 2.11.10+); without it DHT announces too. */
  reannounceTorrents(hashes: string[], trackerUrls?: string[]): Promise<void>;
  setForceStart(hashes: string[], value: boolean): Promise<void>;
  setAutoManagement(hashes: string[], enable: boolean): Promise<void>;
  /** Flips each torrent's current state; there's no way to set it to a value. */
  toggleSequentialDownload(hashes: string[]): Promise<void>;
  /** Flips each torrent's current state; there's no way to set it to a value. */
  toggleFirstLastPiecePrio(hashes: string[]): Promise<void>;
  setSuperSeeding(hashes: string[], value: boolean): Promise<void>;
  /** Answers 409 while torrent queueing is disabled. */
  moveInQueue(hashes: string[], move: QueueMove): Promise<void>;
  exportTorrent(hash: string): Promise<Blob>;
  addTorrents(options: AddTorrentOptions): Promise<AddTorrentResult>;
  getDefaultSavePath(): Promise<string>;
  /**
   * WebAPI 2.11.9+. Starts or polls a lookup for a magnet, info hash or http(s) URL; poll until
   * it's ready. qBittorrent keeps the result for the next torrents/add of the same source.
   * A non-empty `downloader` (a search plugin, WebAPI 2.13.1+) fetches http(s) URLs.
   */
  fetchMetadata(source: string, downloader: string, signal?: AbortSignal): Promise<MetadataLookup>;
  /** WebAPI 2.11.9+. qBittorrent keeps the result for a torrents/add by info hash. */
  parseMetadata(file: File, signal?: AbortSignal): Promise<TorrentMetadata>;
  /** WebAPI 2.17.0+. Stops a lookup and forgets its result. */
  cancelFetchMetadata(source: string): Promise<void>;

  // Organisation and limits (M6).
  setCategory(hashes: string[], category: string): Promise<void>;
  addTags(hashes: string[], tags: string[]): Promise<void>;
  removeTags(hashes: string[], tags: string[]): Promise<void>;
  createCategory(name: string, options: CategoryOptions): Promise<void>;
  editCategory(name: string, options: CategoryOptions): Promise<void>;
  removeCategories(names: string[]): Promise<void>;
  createTags(tags: string[]): Promise<void>;
  deleteTags(tags: string[]): Promise<void>;
  setLocation(hashes: string[], location: string): Promise<void>;
  /** Skips torrents with automatic management; an empty path downloads straight to the save path. */
  setDownloadPath(hashes: string[], path: string): Promise<void>;
  setComment(hashes: string[], comment: string): Promise<void>;
  renameTorrent(hash: string, name: string): Promise<void>;
  /** Bytes/s; 0 removes the limit. */
  setDownloadLimit(hashes: string[], limit: number): Promise<void>;
  setUploadLimit(hashes: string[], limit: number): Promise<void>;
  setShareLimits(hashes: string[], limits: ShareLimits): Promise<void>;

  // Transfer and preferences (M7).
  toggleAltSpeedLimits(): Promise<void>;
  /** WebAPI 2.16.2+. */
  pauseSession(): Promise<void>;
  resumeSession(): Promise<void>;
  /** Bytes/s; 0 removes the limit. Applies to the active (normal or alternative) limits. */
  setGlobalDownloadLimit(limit: number): Promise<void>;
  setGlobalUploadLimit(limit: number): Promise<void>;
  /** Normal and alternative global limits; before WebAPI 2.16.0 these go through preferences. */
  getSpeedLimits(signal?: AbortSignal): Promise<RawSpeedLimits>;
  setSpeedLimits(limits: RawSpeedLimits): Promise<void>;
  getPreferences(signal?: AbortSignal): Promise<RawPreferences>;
  setPreferences(changes: Partial<RawPreferences>): Promise<void>;
  /** WebAPI 2.14.1+. Replaces any existing key and returns the new one. */
  rotateApiKey(): Promise<string>;
  deleteApiKey(): Promise<void>;
  getNetworkInterfaces(): Promise<RawNetworkInterface[]>;
  /** An empty `iface` lists the addresses of every interface. */
  getNetworkInterfaceAddresses(iface: string): Promise<string[]>;
  /** Full paths of the subdirectories (or files) of an absolute path on the qBittorrent host. */
  getDirectoryContent(dirPath: string, mode?: 'dirs' | 'files'): Promise<string[]>;
  getBuildInfo(signal?: AbortSignal): Promise<RawBuildInfo>;
  /** WebAPI 2.15.1+. */
  getProcessInfo(signal?: AbortSignal): Promise<RawProcessInfo>;
  /** WebAPI 2.15.2+. Bytes; missing directories report their nearest existing parent. */
  getFreeSpaceAtPath(path: string): Promise<number>;
  /** WebAPI 2.11.4+. The cookies qBittorrent sends when it downloads .torrent URLs and RSS feeds. */
  getCookies(signal?: AbortSignal): Promise<RawCookie[]>;
  /** WebAPI 2.11.4+. Replaces every cookie. */
  setCookies(cookies: NewCookie[]): Promise<void>;

  // Detail drawer.
  getProperties(hash: string, signal?: AbortSignal): Promise<RawTorrentProperties>;
  getTrackers(hash: string, signal?: AbortSignal): Promise<RawTracker[]>;
  /** One URL per line; a blank line starts the next tier. */
  addTrackers(hash: string, urls: string): Promise<void>;
  /** `tier` needs WebAPI 2.13.0+. Answers 409 when the new URL is already in the torrent. */
  editTracker(hash: string, url: string, changes: TrackerChanges): Promise<void>;
  removeTrackers(hash: string, urls: string[]): Promise<void>;
  getWebSeeds(hash: string, signal?: AbortSignal): Promise<RawWebSeed[]>;
  /** WebAPI 2.11.3+, like the edit and remove. Only http, https and ftp; anything else answers 400. */
  addWebSeeds(hash: string, urls: string[]): Promise<void>;
  /** Answers 409 when `url` isn't one of the torrent's web seeds. */
  editWebSeed(hash: string, url: string, newUrl: string): Promise<void>;
  removeWebSeeds(hash: string, urls: string[]): Promise<void>;
  getFiles(hash: string, signal?: AbortSignal): Promise<RawTorrentFile[]>;
  getPeers(hash: string, rid: number, signal?: AbortSignal): Promise<PeersResponse>;
  /** Peers are `ip:port`, IPv6 as `[ip]:port`. Answers 400 when none of them parse. */
  addPeers(hashes: string[], peers: string[]): Promise<void>;
  /** Adds each peer's IP to the `banned_IPs` preference and disconnects it; the port is ignored. */
  banPeers(peers: string[]): Promise<void>;
  setFilePriority(hash: string, indexes: number[], priority: number): Promise<void>;
  /** WebAPI 2.16.0+. Rejects (409) unless the file is fully downloaded; resolves to a URL to navigate to. */
  fileDownloadUrl(hash: string, index: number): Promise<string>;
  /** Paths are '/'-separated and relative to the torrent root. */
  renameFile(hash: string, oldPath: string, newPath: string): Promise<void>;
  renameFolder(hash: string, oldPath: string, newPath: string): Promise<void>;
  /** One PieceState per piece. */
  getPieceStates(hash: string, signal?: AbortSignal): Promise<number[]>;
  /** WebAPI 2.15.1+. Connected peers that have each piece. */
  getPieceAvailability(hash: string, signal?: AbortSignal): Promise<number[]>;

  // WebUI client data (WebAPI 2.13.1+), stored by qBittorrent and shared across browsers.
  loadClientData(keys: string[]): Promise<Record<string, unknown>>;
  /** Merges into the stored data; a null value deletes that key. */
  storeClientData(data: Record<string, unknown>): Promise<void>;

  /** Entries newer than `lastKnownId` (-1 for everything qBittorrent still holds). */
  getLog(lastKnownId: number, signal?: AbortSignal): Promise<RawLogEntry[]>;
  /** Blocked and banned peers newer than `lastKnownId`. */
  getPeerLog(lastKnownId: number, signal?: AbortSignal): Promise<RawPeerLogEntry[]>;

  // Torrent creator. Tasks live until removed or qBittorrent restarts.
  /** Answers 409 when too many tasks are queued. Resolves to the task ID. */
  addTorrentCreationTask(options: NewTorrentOptions): Promise<string>;
  getTorrentCreationTasks(signal?: AbortSignal): Promise<TorrentCreationTask[]>;
  /** Answers 409 unless the task finished. */
  getCreatedTorrentFile(taskId: string): Promise<Blob>;
  /** Stops the task if it's still running. */
  deleteTorrentCreationTask(taskId: string): Promise<void>;

  // Search engine. Needs Python on the qBittorrent host; search/start answers 409 without it.
  /** Answers 409 at the concurrent search limit. Resolves to the job ID. */
  startSearch(pattern: string, category: string, plugins: SearchPluginScope): Promise<number>;
  stopSearch(id: number): Promise<void>;
  deleteSearch(id: number): Promise<void>;
  getSearchJobs(signal?: AbortSignal): Promise<SearchJob[]>;
  /** Results from `offset` on; jobs only ever append. */
  getSearchResults(id: number, offset: number, signal?: AbortSignal): Promise<SearchResultsPage>;
  /** Adds the result with qBittorrent's default options, letting its plugin fetch the URL. */
  downloadSearchResult(url: string, plugin: string): Promise<void>;
  getSearchPlugins(signal?: AbortSignal): Promise<SearchPlugin[]>;
  /** Plugin URLs or paths on the qBittorrent host. Installs in the background; failures only reach the log. */
  installSearchPlugins(sources: string[]): Promise<void>;
  uninstallSearchPlugins(names: string[]): Promise<void>;
  setSearchPluginsEnabled(names: string[], enabled: boolean): Promise<void>;
  /** Checks for updates in the background; the outcome only reaches the log. */
  updateSearchPlugins(): Promise<void>;

  // RSS. Item paths join folder and feed names with a backslash. Conflicts answer 409 with a reason.
  getRssItems(withData: boolean, signal?: AbortSignal): Promise<RawRssFolder>;
  addRssFolder(path: string): Promise<void>;
  /** An empty `path` names the feed after its URL, at the top level. */
  addRssFeed(url: string, path: string): Promise<void>;
  setRssFeedUrl(path: string, url: string): Promise<void>;
  /** Seconds; 0 follows the global refresh interval. */
  setRssFeedRefreshInterval(path: string, seconds: number): Promise<void>;
  /** Renames and moves: `destPath` is the item's new full path. */
  moveRssItem(itemPath: string, destPath: string): Promise<void>;
  removeRssItem(path: string): Promise<void>;
  /** Without `articleId`, marks every article in the feed or folder. */
  markRssAsRead(itemPath: string, articleId?: string): Promise<void>;
  refreshRssItem(itemPath: string): Promise<void>;
  getRssRules(signal?: AbortSignal): Promise<Record<string, RawRssRule>>;
  /** Creates or replaces the rule. */
  setRssRule(name: string, rule: RawRssRule): Promise<void>;
  renameRssRule(name: string, newName: string): Promise<void>;
  /** WebAPI 2.15.4+. */
  cloneRssRule(sourceName: string, cloneName: string): Promise<void>;
  removeRssRule(name: string): Promise<void>;
  /** Titles of the articles the saved rule matches, keyed by feed name. */
  getRssMatchingArticles(ruleName: string, signal?: AbortSignal): Promise<Record<string, string[]>>;
  /** WebAPI 2.16.2+, like the import. */
  exportRssRules(): Promise<Blob>;
  /** Answers 400 with a reason when the file doesn't parse. */
  importRssRules(file: File): Promise<void>;
}
