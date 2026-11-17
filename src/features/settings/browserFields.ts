import type { SettingSection } from './schema';

export type BrowserFieldKey =
  | 'theme'
  | 'colorScheme'
  | 'sidebarCountMode'
  | 'tagsInName'
  | 'refreshInterval'
  | 'sizeUnit'
  | 'speedUnit'
  | 'dateFormat'
  | 'ratioColors'
  | 'hideInfiniteEta'
  | 'speedsInTitle'
  | 'deleteFilesByDefault'
  | 'defaultDetailsTab'
  | 'autoSizeDetails'
  | 'showSettingKeys'
  | 'settingsFile';

export interface BrowserField {
  key: BrowserFieldKey;
  label: string;
  hint?: string;
}

export const BROWSER_FIELDS: Record<BrowserFieldKey, BrowserField> = {
  theme: {
    key: 'theme',
    label: 'Theme',
    hint: 'Add a theme.css next to index.html to offer a custom theme.',
  },
  colorScheme: { key: 'colorScheme', label: 'Mode' },
  sidebarCountMode: {
    key: 'sidebarCountMode',
    label: 'Sidebar counts',
    hint: 'Matching counts apply the filters in the other sections and the search.',
  },
  tagsInName: {
    key: 'tagsInName',
    label: 'Tags next to names',
    hint: "Show each torrent's tags as chips after its name instead of in a Tags column.",
  },
  refreshInterval: {
    key: 'refreshInterval',
    label: 'Refresh interval',
    hint: 'How often the torrent list updates.',
  },
  sizeUnit: {
    key: 'sizeUnit',
    label: 'Size unit',
    hint: 'Powers of 1024 like qBittorrent (MiB), or of 1000 like most operating systems (MB). Values you type stay in KiB and MiB.',
  },
  speedUnit: {
    key: 'speedUnit',
    label: 'Speed unit',
    hint: 'How transfer speeds are shown. Speed limits are still entered in KiB/s.',
  },
  dateFormat: {
    key: 'dateFormat',
    label: 'Date format',
    hint: 'How full dates and times are shown. Lists still show how long ago, with the full date on hover.',
  },
  ratioColors: {
    key: 'ratioColors',
    label: 'Ratio colors',
    hint: 'Color share ratios below 0.5 red and below 1 amber. The full scale also colors 1 to 5 green and 5 and up blue.',
  },
  hideInfiniteEta: {
    key: 'hideInfiniteEta',
    label: 'Hide infinite ETA',
    hint: 'Leave the ETA blank instead of showing ∞ while a torrent has no download speed.',
  },
  speedsInTitle: {
    key: 'speedsInTitle',
    label: 'Speeds in tab title',
    hint: "Show the download and upload speeds in the browser tab's title.",
  },
  deleteFilesByDefault: {
    key: 'deleteFilesByDefault',
    label: 'Delete files by default',
    hint: 'Start the delete dialog with "Also delete the files from disk" ticked.',
  },
  defaultDetailsTab: {
    key: 'defaultDetailsTab',
    label: 'Details tab',
    hint: 'The tab the details panel opens on. Moving between torrents keeps the current tab.',
  },
  autoSizeDetails: {
    key: 'autoSizeDetails',
    label: 'Auto-size details panel',
    hint: 'Open the details panel tall enough to show the General tab, up to half the window. Dragging its edge sets a fixed height until you change this.',
  },
  showSettingKeys: {
    key: 'showSettingKeys',
    label: 'Show raw keys',
    hint: "Print each qBittorrent setting's preference key under its label.",
  },
  settingsFile: {
    key: 'settingsFile',
    label: 'Settings file',
    hint: 'Export these settings, the table layout and remembered dialog options to a file, or import them in another browser. Importing replaces them and reloads the page.',
  },
};

export interface BrowserSection extends Omit<SettingSection, 'groups'> {
  groups: { title?: string; hint?: string; fields: BrowserField[] }[];
}

export const BROWSER_SECTION: BrowserSection = {
  id: 'browser',
  title: 'This browser',
  groups: [{ fields: Object.values(BROWSER_FIELDS) }],
};
