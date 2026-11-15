// Enum values checked against the qBittorrent 5.0 WebAPI docs.

/** `state` field of a torrent (WebAPI 2.11+: paused* became stopped*). */
export enum TorrentState {
  Error = 'error',
  MissingFiles = 'missingFiles',
  Uploading = 'uploading',
  StoppedUP = 'stoppedUP',
  QueuedUP = 'queuedUP',
  StalledUP = 'stalledUP',
  CheckingUP = 'checkingUP',
  ForcedUP = 'forcedUP',
  Allocating = 'allocating',
  Downloading = 'downloading',
  MetaDL = 'metaDL',
  ForcedMetaDL = 'forcedMetaDL',
  StoppedDL = 'stoppedDL',
  QueuedDL = 'queuedDL',
  StalledDL = 'stalledDL',
  CheckingDL = 'checkingDL',
  ForcedDL = 'forcedDL',
  CheckingResumeData = 'checkingResumeData',
  Moving = 'moving',
  Unknown = 'unknown',
}

export enum ConnectionStatus {
  Connected = 'connected',
  Firewalled = 'firewalled',
  Disconnected = 'disconnected',
}

/** `eta` value qBittorrent uses for "infinite" (100 days in seconds). */
export const ETA_INFINITY = 8_640_000;

export enum FilePriority {
  DoNotDownload = 0,
  Normal = 1,
  High = 6,
  Maximum = 7,
}

export enum TrackerStatus {
  Disabled = 0,
  NotContacted = 1,
  Working = 2,
  Updating = 3,
  NotWorking = 4,
  /** 5.1+ */
  TrackerError = 5,
  /** 5.1+ */
  Unreachable = 6,
}

/** What happens when a share limit is reached. WebAPI 2.12+ uses these strings. */
export enum ShareLimitAction {
  Default = 'Default',
  Stop = 'Stop',
  Remove = 'Remove',
  RemoveWithContent = 'RemoveWithContent',
  EnableSuperSeeding = 'EnableSuperSeeding',
}

/** How ratio and time limits combine. WebAPI 2.15.3+. */
export enum ShareLimitsMode {
  Default = 'Default',
  MatchAny = 'MatchAny',
  MatchAll = 'MatchAll',
}

/** `contentLayout` for torrents/add and the `torrent_content_layout` preference. */
export enum ContentLayout {
  Original = 'Original',
  Subfolder = 'Subfolder',
  NoSubfolder = 'NoSubfolder',
}

/** `stopCondition` for torrents/add and the `torrent_stop_condition` preference. */
export enum StopCondition {
  None = 'None',
  MetadataReceived = 'MetadataReceived',
  FilesChecked = 'FilesChecked',
}

/** Share limit sentinels: use the global limit, or no limit at all. */
export const LIMIT_GLOBAL = -2;
export const LIMIT_NONE = -1;

/** WebAPI versions that change request or response shapes. */
export const API = {
  /** setPreferences accepts only one of each share-limit pair (enabled flag or value). */
  prefsLimitPairs: '2.11.6',
  /** torrentcreator/addTask percent-decodes each tracker and web seed URL (qBittorrent 5.2). */
  creatorDecodesUrls: '2.11.6',
  /** setShareLimits requires shareLimitAction; maindata adds share_limit_action. */
  shareLimitAction: '2.12.0',
  /** torrents/removeTrackers percent-decodes each URL (qBittorrent 5.1). */
  removeTrackersDecodesUrls: '2.11.3',
  /** torrents/addWebSeeds, editWebSeed and removeWebSeeds exist (qBittorrent 5.1). */
  editWebSeeds: '2.11.3',
  /** app/cookies and app/setCookies exist (qBittorrent 5.1; added mid-2.11.3 without a bump). */
  cookies: '2.11.4',
  /** torrents/fetchMetadata and parseMetadata exist; torrents/add takes filePriorities (qBittorrent 5.2). */
  fetchMetadata: '2.11.9',
  /** torrents/reannounce takes `urls` to reannounce only those trackers. */
  reannounceTrackers: '2.11.10',
  /** torrents/setComment exists. */
  setComment: '2.12.1',
  /** torrents/editTracker renames `origUrl` to `url` and accepts `tier`. */
  editTrackerTier: '2.13.0',
  /** clientdata/load and clientdata/store exist (qBittorrent 5.2). */
  clientData: '2.13.1',
  /** torrents/add and fetchMetadata take `downloader`, a search plugin that fetches the URL. */
  searchPluginDownloader: '2.13.1',
  /** auth/login answers 401 on bad credentials; torrents/add returns counts and 409. */
  addReturnsCounts: '2.14.0',
  /** sync/torrentPeers adds host_name. */
  peerHostName: '2.15.1',
  /** torrents/pieceAvailability exists. */
  pieceAvailability: '2.15.1',
  /** app/processInfo exists. */
  processInfo: '2.15.1',
  /** app/getFreeSpaceAtPath exists. */
  freeSpaceAtPath: '2.15.2',
  /** setShareLimits requires shareLimitsMode; maindata adds share_limits_mode. */
  shareLimitsMode: '2.15.3',
  /** rss/cloneRule exists. */
  cloneRssRule: '2.15.4',
  /** torrents/add drops skip_checking in favour of seedMode. */
  seedMode: '2.16.0',
  /** torrentcreator/addTask takes ignoreDotfiles. */
  creatorIgnoreDotfiles: '2.16.0',
  /** transfer/getSpeedLimits and setSpeedLimits exist (normal and alternative together). */
  speedLimits: '2.16.0',
  /** torrents/downloadFile serves a completed file. */
  downloadFile: '2.16.0',
  /** search/status adds pattern, category and plugins; search jobs can outlive qBittorrent restarts. */
  searchJobDetails: '2.16.1',
  /** rss/exportRules and rss/importRules exist (JSON). */
  rssRulesImportExport: '2.16.2',
  /** transfer/pauseSession and resumeSession exist; maindata adds session_state. */
  pauseSession: '2.16.2',
  /** createCategory and editCategory take share limits; editCategory no longer requires savePath. */
  categoryShareLimits: '2.16.2',
  /** torrents/cancelFetchMetadata exists; fetchMetadata stops percent-decoding `source`. */
  cancelFetchMetadata: '2.17.0',
} as const;

/** torrents/pieceStates values. */
export enum PieceState {
  Missing = 0,
  Downloading = 1,
  Downloaded = 2,
}

/** log/main `type` bit flags. */
export enum LogType {
  Normal = 1,
  Info = 2,
  Warning = 4,
  Critical = 8,
}
