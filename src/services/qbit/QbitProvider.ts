import type { IProvider } from './IProvider';
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
  RawSearchJob,
  RawSearchPlugin,
  RawSearchResults,
  RawTorrentCreationTask,
  RawTorrentFile,
  RawTorrentMetadata,
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
  QueueMove,
  SearchJob,
  SearchPlugin,
  SearchPluginScope,
  SearchResultsPage,
  ShareLimits,
  TorrentCreationTask,
  TorrentMetadata,
  TrackerChanges,
} from '@/types/app';
import { API } from '@/constants/qbit';
import {
  apiAtLeast,
  creationTaskForm,
  firstParsedMetadata,
  normalizeCreationTask,
  normalizeMetadata,
  normalizeMetadataLookup,
  normalizeSearchJob,
  normalizeSearchPlugin,
  normalizeSearchResults,
  shareLimitsFields,
  shareLimitsForm,
} from '@/sync/normalize';
import {
  QbtHttpError,
  apiUrl,
  get,
  getBlob,
  head,
  post,
  postMultipart,
  postWithStatus,
} from './http';

export class QbitProvider implements IProvider {
  /** Cached by getWebApiVersion; request shapes depend on it. */
  private apiVersion: string | null = null;

  async login(username: string, password: string): Promise<boolean> {
    try {
      const body = await post<string>('auth/login', { username, password });
      // 5.0 answers success with 200 "Ok."; newer versions may send a different or empty body.
      return body !== 'Fails.';
    } catch (err) {
      // 5.0 answers bad credentials with 200 "Fails."; 5.3 uses 401 Unauthorized.
      if (err instanceof QbtHttpError && err.status === 401) return false;
      throw err;
    }
  }

  async logout(): Promise<void> {
    await post('auth/logout');
  }

  async shutdown(): Promise<void> {
    await post('app/shutdown');
  }

  async getVersion(): Promise<string> {
    const version = await get<string>('app/version');
    return version.trim().replace(/^v/, '');
  }

  async getWebApiVersion(): Promise<string> {
    this.apiVersion = (await get<string>('app/webapiVersion')).trim();
    return this.apiVersion;
  }

  getMaindata(rid: number, signal?: AbortSignal): Promise<MaindataResponse> {
    return get<MaindataResponse>('sync/maindata', { rid }, { signal });
  }

  async startTorrents(hashes: string[]): Promise<void> {
    await post('torrents/start', { hashes: joinHashes(hashes) });
  }

  async stopTorrents(hashes: string[]): Promise<void> {
    await post('torrents/stop', { hashes: joinHashes(hashes) });
  }

  async deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void> {
    await post('torrents/delete', { hashes: joinHashes(hashes), deleteFiles });
  }

  async recheckTorrents(hashes: string[]): Promise<void> {
    await post('torrents/recheck', { hashes: joinHashes(hashes) });
  }

  async reannounceTorrents(hashes: string[], trackerUrls?: string[]): Promise<void> {
    await post('torrents/reannounce', {
      hashes: joinHashes(hashes),
      urls: trackerUrls && joinEncodedUrls(trackerUrls),
    });
  }

  async setForceStart(hashes: string[], value: boolean): Promise<void> {
    await post('torrents/setForceStart', { hashes: joinHashes(hashes), value });
  }

  async setAutoManagement(hashes: string[], enable: boolean): Promise<void> {
    await post('torrents/setAutoManagement', { hashes: joinHashes(hashes), enable });
  }

  async toggleSequentialDownload(hashes: string[]): Promise<void> {
    await post('torrents/toggleSequentialDownload', { hashes: joinHashes(hashes) });
  }

  async toggleFirstLastPiecePrio(hashes: string[]): Promise<void> {
    await post('torrents/toggleFirstLastPiecePrio', { hashes: joinHashes(hashes) });
  }

  async setSuperSeeding(hashes: string[], value: boolean): Promise<void> {
    await post('torrents/setSuperSeeding', { hashes: joinHashes(hashes), value });
  }

  async moveInQueue(hashes: string[], move: QueueMove): Promise<void> {
    await post(`torrents/${QUEUE_ENDPOINTS[move]}`, { hashes: joinHashes(hashes) });
  }

  exportTorrent(hash: string): Promise<Blob> {
    return getBlob('torrents/export', { hash });
  }

  async addTorrents(o: AddTorrentOptions): Promise<AddTorrentResult> {
    const form = new FormData();
    if (o.urls.length) form.append('urls', o.urls.join('\n'));
    for (const file of o.files) form.append('torrents', file, file.name);
    if (o.savePath) form.append('savepath', o.savePath);
    if (o.category) form.append('category', o.category);
    if (o.tags.length) form.append('tags', o.tags.join(','));
    // 5.0 renamed `paused` to `stopped`; unknown fields are ignored, so send both.
    form.append('stopped', String(o.stopped));
    form.append('paused', String(o.stopped));
    form.append('sequentialDownload', String(o.sequential));
    form.append('firstLastPiecePrio', String(o.firstLastPiecePrio));
    form.append(
      apiAtLeast(this.apiVersion, API.seedMode) ? 'seedMode' : 'skip_checking',
      String(o.skipChecking),
    );
    if (o.rename) form.append('rename', o.rename);
    if (o.filePriorities?.length) form.append('filePriorities', o.filePriorities.join(','));
    if (o.autoTmm !== undefined) form.append('autoTMM', String(o.autoTmm));
    if (o.contentLayout) form.append('contentLayout', o.contentLayout);
    if (o.stopCondition) form.append('stopCondition', o.stopCondition);
    if (o.addToTopOfQueue !== undefined) form.append('addToTopOfQueue', String(o.addToTopOfQueue));
    if (o.useDownloadPath !== undefined) form.append('useDownloadPath', String(o.useDownloadPath));
    if (o.useDownloadPath && o.downloadPath) form.append('downloadPath', o.downloadPath);
    if (o.dlLimit) form.append('dlLimit', String(o.dlLimit));
    if (o.upLimit) form.append('upLimit', String(o.upLimit));
    if (o.downloader && apiAtLeast(this.apiVersion, API.searchPluginDownloader))
      form.append('downloader', o.downloader);
    if (o.shareLimits) {
      form.append('ratioLimit', String(o.shareLimits.ratioLimit));
      form.append('seedingTimeLimit', String(o.shareLimits.seedingTimeLimit));
      form.append('inactiveSeedingTimeLimit', String(o.shareLimits.inactiveSeedingTimeLimit));
      form.append('shareLimitAction', o.shareLimits.action);
      if (apiAtLeast(this.apiVersion, API.shareLimitsMode))
        form.append('shareLimitsMode', o.shareLimits.mode);
    }
    try {
      const body = await postMultipart<unknown>('torrents/add', form);
      if (body === 'Fails.') return { ok: false, failed: 0 };
      // WebAPI 2.14+: { success_count, pending_count, failure_count, added_torrent_ids }.
      const failed = (body as { failure_count?: number } | null)?.failure_count ?? 0;
      return { ok: true, failed };
    } catch (err) {
      // 415: invalid .torrent file(s). 409 (WebAPI 2.14+): every torrent failed.
      if (err instanceof QbtHttpError && (err.status === 415 || err.status === 409)) {
        const failed = (err.body as { failure_count?: number } | null)?.failure_count ?? 0;
        return { ok: false, failed };
      }
      throw err;
    }
  }

  async getDefaultSavePath(): Promise<string> {
    return (await get<string>('app/defaultSavePath')).trim();
  }

  async fetchMetadata(
    source: string,
    downloader: string,
    signal?: AbortSignal,
  ): Promise<MetadataLookup> {
    const decodesSource = !apiAtLeast(this.apiVersion, API.cancelFetchMetadata);
    const sendsDownloader =
      downloader !== '' && apiAtLeast(this.apiVersion, API.searchPluginDownloader);
    const { status, body } = await postWithStatus<RawTorrentMetadata>(
      'torrents/fetchMetadata',
      {
        source: decodesSource ? encodeURIComponent(source) : source,
        downloader: sendsDownloader ? downloader : undefined,
      },
      { signal },
    );
    return normalizeMetadataLookup(status === 200, body ?? {});
  }

  async parseMetadata(file: File, signal?: AbortSignal): Promise<TorrentMetadata> {
    // One file per request: 5.3 and older key uploads by file name, so same-named files collide.
    const form = new FormData();
    form.append('torrents', file, file.name);
    const raw = firstParsedMetadata(
      await postMultipart<unknown>('torrents/parseMetadata', form, { signal }),
    );
    if (!raw) throw new QbtHttpError(415, `${file.name} is not a valid torrent file.`);
    return normalizeMetadata(raw);
  }

  async cancelFetchMetadata(source: string): Promise<void> {
    await post('torrents/cancelFetchMetadata', { source: encodeURIComponent(source) });
  }

  async setCategory(hashes: string[], category: string): Promise<void> {
    await post('torrents/setCategory', { hashes: joinHashes(hashes), category });
  }

  async addTags(hashes: string[], tags: string[]): Promise<void> {
    await post('torrents/addTags', { hashes: joinHashes(hashes), tags: tags.join(',') });
  }

  async removeTags(hashes: string[], tags: string[]): Promise<void> {
    await post('torrents/removeTags', { hashes: joinHashes(hashes), tags: tags.join(',') });
  }

  async createCategory(category: string, options: CategoryOptions): Promise<void> {
    await post('torrents/createCategory', categoryForm(category, options, this.apiVersion));
  }

  async editCategory(category: string, options: CategoryOptions): Promise<void> {
    await post('torrents/editCategory', categoryForm(category, options, this.apiVersion));
  }

  async removeCategories(names: string[]): Promise<void> {
    await post('torrents/removeCategories', { categories: names.join('\n') });
  }

  async createTags(tags: string[]): Promise<void> {
    await post('torrents/createTags', { tags: tags.join(',') });
  }

  async deleteTags(tags: string[]): Promise<void> {
    await post('torrents/deleteTags', { tags: tags.join(',') });
  }

  async setLocation(hashes: string[], location: string): Promise<void> {
    await post('torrents/setLocation', { hashes: joinHashes(hashes), location });
  }

  async setDownloadPath(hashes: string[], path: string): Promise<void> {
    await post('torrents/setDownloadPath', { id: joinHashes(hashes), path });
  }

  async setComment(hashes: string[], comment: string): Promise<void> {
    await post('torrents/setComment', { hashes: joinHashes(hashes), comment });
  }

  async renameTorrent(hash: string, name: string): Promise<void> {
    await post('torrents/rename', { hash, name });
  }

  async setDownloadLimit(hashes: string[], limit: number): Promise<void> {
    await post('torrents/setDownloadLimit', { hashes: joinHashes(hashes), limit });
  }

  async setUploadLimit(hashes: string[], limit: number): Promise<void> {
    await post('torrents/setUploadLimit', { hashes: joinHashes(hashes), limit });
  }

  async setShareLimits(hashes: string[], limits: ShareLimits): Promise<void> {
    await post(
      'torrents/setShareLimits',
      shareLimitsForm(joinHashes(hashes), limits, this.apiVersion),
    );
  }

  async toggleAltSpeedLimits(): Promise<void> {
    await post('transfer/toggleSpeedLimitsMode');
  }

  async pauseSession(): Promise<void> {
    await post('transfer/pauseSession');
  }

  async resumeSession(): Promise<void> {
    await post('transfer/resumeSession');
  }

  async setGlobalDownloadLimit(limit: number): Promise<void> {
    await post('transfer/setDownloadLimit', { limit });
  }

  async setGlobalUploadLimit(limit: number): Promise<void> {
    await post('transfer/setUploadLimit', { limit });
  }

  async getSpeedLimits(signal?: AbortSignal): Promise<RawSpeedLimits> {
    if (apiAtLeast(this.apiVersion, API.speedLimits)) {
      return get('transfer/getSpeedLimits', undefined, { signal });
    }
    const { dl_limit, up_limit, alt_dl_limit, alt_up_limit } = await this.getPreferences(signal);
    return { dl_limit, up_limit, alt_dl_limit, alt_up_limit };
  }

  async setSpeedLimits(limits: RawSpeedLimits): Promise<void> {
    if (apiAtLeast(this.apiVersion, API.speedLimits)) {
      await post('transfer/setSpeedLimits', { ...limits });
    } else {
      await this.setPreferences({ ...limits });
    }
  }

  getPreferences(signal?: AbortSignal): Promise<RawPreferences> {
    return get('app/preferences', undefined, { signal });
  }

  async setPreferences(changes: Partial<RawPreferences>): Promise<void> {
    await post('app/setPreferences', { json: JSON.stringify(changes) });
  }

  async rotateApiKey(): Promise<string> {
    const { apiKey } = await post<{ apiKey: string }>('app/rotateAPIKey');
    return apiKey;
  }

  async deleteApiKey(): Promise<void> {
    await post('app/deleteAPIKey');
  }

  getNetworkInterfaces(): Promise<RawNetworkInterface[]> {
    return get('app/networkInterfaceList');
  }

  getNetworkInterfaceAddresses(iface: string): Promise<string[]> {
    return get('app/networkInterfaceAddressList', { iface });
  }

  getDirectoryContent(dirPath: string, mode: 'dirs' | 'files' = 'dirs'): Promise<string[]> {
    return get('app/getDirectoryContent', { dirPath, mode });
  }

  getBuildInfo(signal?: AbortSignal): Promise<RawBuildInfo> {
    return get('app/buildInfo', undefined, { signal });
  }

  getProcessInfo(signal?: AbortSignal): Promise<RawProcessInfo> {
    return get('app/processInfo', {}, { signal });
  }

  async getFreeSpaceAtPath(path: string): Promise<number> {
    return Number(await get<string | number>('app/getFreeSpaceAtPath', { path }));
  }

  getCookies(signal?: AbortSignal): Promise<RawCookie[]> {
    return get('app/cookies', {}, { signal });
  }

  async setCookies(cookies: NewCookie[]): Promise<void> {
    await post('app/setCookies', { cookies: JSON.stringify(cookies) });
  }

  getProperties(hash: string, signal?: AbortSignal): Promise<RawTorrentProperties> {
    return get('torrents/properties', { hash }, { signal });
  }

  getTrackers(hash: string, signal?: AbortSignal): Promise<RawTracker[]> {
    return get('torrents/trackers', { hash }, { signal });
  }

  async addTrackers(hash: string, urls: string): Promise<void> {
    await post('torrents/addTrackers', { hash, urls });
  }

  async editTracker(hash: string, url: string, { newUrl, tier }: TrackerChanges): Promise<void> {
    if (apiAtLeast(this.apiVersion, API.editTrackerTier)) {
      await post('torrents/editTracker', { hash, url, newUrl, tier });
    } else if (newUrl !== undefined) {
      await post('torrents/editTracker', { hash, origUrl: url, newUrl });
    }
  }

  async removeTrackers(hash: string, urls: string[]): Promise<void> {
    const decodesUrls = apiAtLeast(this.apiVersion, API.removeTrackersDecodesUrls);
    await post('torrents/removeTrackers', {
      hash,
      urls: decodesUrls ? joinEncodedUrls(urls) : urls.join('|'),
    });
  }

  getWebSeeds(hash: string, signal?: AbortSignal): Promise<RawWebSeed[]> {
    return get('torrents/webseeds', { hash }, { signal });
  }

  async addWebSeeds(hash: string, urls: string[]): Promise<void> {
    await post('torrents/addWebSeeds', { hash, urls: joinEncodedUrls(urls) });
  }

  async editWebSeed(hash: string, url: string, newUrl: string): Promise<void> {
    await post('torrents/editWebSeed', {
      hash,
      origUrl: encodeURIComponent(url),
      newUrl: encodeURIComponent(newUrl),
    });
  }

  async removeWebSeeds(hash: string, urls: string[]): Promise<void> {
    await post('torrents/removeWebSeeds', { hash, urls: joinEncodedUrls(urls) });
  }

  getFiles(hash: string, signal?: AbortSignal): Promise<RawTorrentFile[]> {
    return get('torrents/files', { hash }, { signal });
  }

  getPeers(hash: string, rid: number, signal?: AbortSignal): Promise<PeersResponse> {
    return get('sync/torrentPeers', { hash, rid }, { signal });
  }

  async addPeers(hashes: string[], peers: string[]): Promise<void> {
    await post('torrents/addPeers', { hashes: joinHashes(hashes), peers: peers.join('|') });
  }

  async banPeers(peers: string[]): Promise<void> {
    await post('transfer/banPeers', { peers: peers.join('|') });
  }

  async setFilePriority(hash: string, indexes: number[], priority: number): Promise<void> {
    await post('torrents/filePrio', { hash, id: indexes.join('|'), priority });
  }

  async fileDownloadUrl(hash: string, index: number): Promise<string> {
    const query = { hash, file: index };
    // The HEAD preflight surfaces errors here; navigating straight to a failing URL opens an error page.
    await head('torrents/downloadFile', query);
    return apiUrl('torrents/downloadFile', query);
  }

  async renameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
    await post('torrents/renameFile', { hash, oldPath, newPath });
  }

  async renameFolder(hash: string, oldPath: string, newPath: string): Promise<void> {
    await post('torrents/renameFolder', { hash, oldPath, newPath });
  }

  getPieceStates(hash: string, signal?: AbortSignal): Promise<number[]> {
    return get('torrents/pieceStates', { hash }, { signal });
  }

  getPieceAvailability(hash: string, signal?: AbortSignal): Promise<number[]> {
    return get('torrents/pieceAvailability', { hash }, { signal });
  }

  async loadClientData(keys: string[]): Promise<Record<string, unknown>> {
    const data = await get<unknown>('clientdata/load', { keys: JSON.stringify(keys) });
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  }

  async storeClientData(data: Record<string, unknown>): Promise<void> {
    await post('clientdata/store', { data: JSON.stringify(data) });
  }

  getLog(lastKnownId: number, signal?: AbortSignal): Promise<RawLogEntry[]> {
    return get(
      'log/main',
      { normal: true, info: true, warning: true, critical: true, last_known_id: lastKnownId },
      { signal },
    );
  }

  getPeerLog(lastKnownId: number, signal?: AbortSignal): Promise<RawPeerLogEntry[]> {
    return get('log/peers', { last_known_id: lastKnownId }, { signal });
  }

  async addTorrentCreationTask(options: NewTorrentOptions): Promise<string> {
    const result = await post<{ taskID: string }>(
      'torrentcreator/addTask',
      creationTaskForm(options, this.apiVersion),
    );
    return result.taskID;
  }

  async getTorrentCreationTasks(signal?: AbortSignal): Promise<TorrentCreationTask[]> {
    const tasks = await get<RawTorrentCreationTask[]>('torrentcreator/status', undefined, {
      signal,
    });
    return tasks.map(normalizeCreationTask);
  }

  getCreatedTorrentFile(taskId: string): Promise<Blob> {
    return getBlob('torrentcreator/torrentFile', { taskID: taskId });
  }

  async deleteTorrentCreationTask(taskId: string): Promise<void> {
    await post('torrentcreator/deleteTask', { taskID: taskId });
  }

  async startSearch(
    pattern: string,
    category: string,
    plugins: SearchPluginScope,
  ): Promise<number> {
    const result = await post<{ id: number }>('search/start', {
      pattern,
      category,
      plugins: typeof plugins === 'string' ? plugins : plugins.join('|'),
    });
    return result.id;
  }

  async stopSearch(id: number): Promise<void> {
    await post('search/stop', { id });
  }

  async deleteSearch(id: number): Promise<void> {
    await post('search/delete', { id });
  }

  async getSearchJobs(signal?: AbortSignal): Promise<SearchJob[]> {
    const jobs = await get<RawSearchJob[]>('search/status', undefined, { signal });
    return jobs.map(normalizeSearchJob);
  }

  async getSearchResults(
    id: number,
    offset: number,
    signal?: AbortSignal,
  ): Promise<SearchResultsPage> {
    const page = await get<RawSearchResults>('search/results', { id, offset }, { signal });
    return normalizeSearchResults(page, offset);
  }

  async downloadSearchResult(url: string, plugin: string): Promise<void> {
    await post('search/downloadTorrent', { torrentUrl: url, pluginName: plugin });
  }

  async getSearchPlugins(signal?: AbortSignal): Promise<SearchPlugin[]> {
    const plugins = await get<RawSearchPlugin[]>('search/plugins', undefined, { signal });
    return plugins.map(normalizeSearchPlugin);
  }

  async installSearchPlugins(sources: string[]): Promise<void> {
    await post('search/installPlugin', { sources: sources.join('|') });
  }

  async uninstallSearchPlugins(names: string[]): Promise<void> {
    await post('search/uninstallPlugin', { names: names.join('|') });
  }

  async setSearchPluginsEnabled(names: string[], enabled: boolean): Promise<void> {
    await post('search/enablePlugin', { names: names.join('|'), enable: enabled });
  }

  async updateSearchPlugins(): Promise<void> {
    await post('search/updatePlugins');
  }

  getRssItems(withData: boolean, signal?: AbortSignal): Promise<RawRssFolder> {
    return get('rss/items', { withData }, { signal });
  }

  async addRssFolder(path: string): Promise<void> {
    await post('rss/addFolder', { path });
  }

  async addRssFeed(url: string, path: string): Promise<void> {
    await post('rss/addFeed', { url, path });
  }

  async setRssFeedUrl(path: string, url: string): Promise<void> {
    await post('rss/setFeedURL', { path, url });
  }

  async setRssFeedRefreshInterval(path: string, seconds: number): Promise<void> {
    await post('rss/setFeedRefreshInterval', { path, refreshInterval: seconds });
  }

  async moveRssItem(itemPath: string, destPath: string): Promise<void> {
    await post('rss/moveItem', { itemPath, destPath });
  }

  async removeRssItem(path: string): Promise<void> {
    await post('rss/removeItem', { path });
  }

  async markRssAsRead(itemPath: string, articleId?: string): Promise<void> {
    await post('rss/markAsRead', { itemPath, articleId });
  }

  async refreshRssItem(itemPath: string): Promise<void> {
    await post('rss/refreshItem', { itemPath });
  }

  getRssRules(signal?: AbortSignal): Promise<Record<string, RawRssRule>> {
    return get('rss/rules', undefined, { signal });
  }

  async setRssRule(name: string, rule: RawRssRule): Promise<void> {
    await post('rss/setRule', { ruleName: name, ruleDef: JSON.stringify(rule) });
  }

  async renameRssRule(name: string, newName: string): Promise<void> {
    await post('rss/renameRule', { ruleName: name, newRuleName: newName });
  }

  async cloneRssRule(sourceName: string, cloneName: string): Promise<void> {
    await post('rss/cloneRule', { sourceName, cloneName });
  }

  async removeRssRule(name: string): Promise<void> {
    await post('rss/removeRule', { ruleName: name });
  }

  getRssMatchingArticles(
    ruleName: string,
    signal?: AbortSignal,
  ): Promise<Record<string, string[]>> {
    return get('rss/matchingArticles', { ruleName }, { signal });
  }

  exportRssRules(): Promise<Blob> {
    return getBlob('rss/exportRules');
  }

  async importRssRules(file: File): Promise<void> {
    const form = new FormData();
    form.append('rules', file, file.name);
    await postMultipart('rss/importRules', form);
  }
}

const QUEUE_ENDPOINTS: Record<QueueMove, string> = {
  top: 'topPrio',
  up: 'increasePrio',
  down: 'decreasePrio',
  bottom: 'bottomPrio',
};

function categoryForm(
  category: string,
  options: CategoryOptions,
  apiVersion: string | null,
): Record<string, string | number> {
  const form = { category, savePath: options.savePath };
  if (!options.shareLimits || !apiAtLeast(apiVersion, API.categoryShareLimits)) return form;
  return { ...form, ...shareLimitsFields(options.shareLimits, apiVersion) };
}

function joinHashes(hashes: string[]): string {
  return hashes.join('|');
}

// qBittorrent percent-decodes each tracker and web seed URL after splitting on '|'; unencoded, a '%' or '|' in a URL breaks the match.
function joinEncodedUrls(urls: string[]): string {
  return urls.map(encodeURIComponent).join('|');
}
