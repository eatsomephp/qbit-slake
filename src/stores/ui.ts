import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { STORAGE_PREFIX } from '@/lib/legacyStorage';
import { dateFormat, hideInfiniteEta, sizeUnit, speedUnit } from '@/lib/format';
import { ratioColors } from '@/lib/ratioColors';
import type { SortEntry } from '@/lib/sortTorrents';
import {
  clearValue,
  emptyFilters,
  markOf,
  toggleInclude,
  type FilterGroup,
  type FilterGroupKey,
  type TorrentFilters,
} from '@/lib/torrentFilters';
import type { ThemePreference } from '@/themes/themes';

const KEY = STORAGE_PREFIX;
const LEGACY_FILTERS_KEY = KEY + 'filters';

export const DETAILS_TABS = ['general', 'trackers', 'peers', 'files', 'webseeds'] as const;
export type DetailsTab = (typeof DETAILS_TABS)[number];
export type DefaultDetailsTab = DetailsTab | 'last';
export const DETAILS_TAB_LABELS: Record<DetailsTab, string> = {
  general: 'General',
  trackers: 'Trackers',
  peers: 'Peers',
  files: 'Files',
  webseeds: 'Web seeds',
};
export type ColorScheme = 'system' | 'light' | 'dark';
export type SidebarCountMode = 'matching' | 'all';
export type TableView = 'stacked' | 'comfortable' | 'compact';
export const COLOR_SCHEME_KEY = KEY + 'theme';
export const THEME_KEY = KEY + 'themeId';

/** Local UI preferences, persisted to localStorage (except the search text). */
export const useUiStore = defineStore('ui', () => {
  const sorting = useStorage<SortEntry[]>(KEY + 'sorting', [{ id: 'addedOn', desc: true }]);
  const columnSizing = useStorage<Record<string, number>>(KEY + 'columnSizing', {});
  const columnVisibility = useStorage<Record<string, boolean>>(KEY + 'columnVisibility', {});
  const columnOrder = useStorage<string[]>(KEY + 'columnOrder', []);
  const tableView = useStorage<TableView>(KEY + 'tableView', 'stacked');
  const tagsInName = useStorage(KEY + 'tagsInName', true);
  const multiSelect = useStorage(KEY + 'multiSelect', false);
  const showSettingKeys = useStorage(KEY + 'showSettingKeys', false);
  const speedsInTitle = useStorage(KEY + 'speedsInTitle', false);
  const deleteFilesByDefault = useStorage(KEY + 'deleteFilesByDefault', false);
  /** maindata poll interval in ms. */
  const refreshInterval = useStorage(KEY + 'refreshInterval', 1500);

  localStorage.removeItem(LEGACY_FILTERS_KEY);
  const filters = useStorage<TorrentFilters>(KEY + 'filters.v2', emptyFilters(), undefined, {
    mergeDefaults: true,
  });
  const search = ref('');
  const sidebarOpen = useStorage(KEY + 'sidebarOpen', true);
  const sidebarWidth = useStorage(KEY + 'sidebarWidth', 256);
  const collapsedSidebarKeys = useStorage<string[]>(KEY + 'collapsedSidebarKeys', [
    'trackers',
    'locations',
  ]);
  const showAllSidebarSections = useStorage<string[]>(KEY + 'showAllSidebarSections', []);
  const sidebarCountMode = useStorage<SidebarCountMode>(KEY + 'sidebarCountMode', 'matching');
  const detailsOpen = useStorage(KEY + 'detailsOpen', true);
  localStorage.removeItem(KEY + 'detailsHeight');
  const detailsHeight = useStorage<number | null>(KEY + 'detailsDraggedHeight', null);
  const autoSizeDetails = useStorage(KEY + 'autoSizeDetails', true);
  watch(autoSizeDetails, () => (detailsHeight.value = null));
  const detailsTab = useStorage<DetailsTab>(KEY + 'detailsTab', 'general');
  if (!DETAILS_TABS.includes(detailsTab.value)) detailsTab.value = 'general';
  const defaultDetailsTab = useStorage<DefaultDetailsTab>(KEY + 'defaultDetailsTab', 'last');
  if (defaultDetailsTab.value !== 'last' && !DETAILS_TABS.includes(defaultDetailsTab.value))
    defaultDetailsTab.value = 'last';
  const colorScheme = useStorage<ColorScheme>(COLOR_SCHEME_KEY, 'system');
  const theme = useStorage<ThemePreference>(THEME_KEY, 'auto');

  function updateFilterGroup(group: FilterGroupKey, update: (g: FilterGroup) => FilterGroup) {
    filters.value = { ...filters.value, [group]: update(filters.value[group]) };
  }

  function toggleFilterValue(group: FilterGroupKey, value: string) {
    updateFilterGroup(group, (g) =>
      markOf(g, value) === null ? toggleInclude(g, value) : clearValue(g, value),
    );
  }

  function switchToDefaultDetailsTab() {
    if (defaultDetailsTab.value !== 'last') detailsTab.value = defaultDetailsTab.value;
  }

  function expandDetails() {
    if (!detailsOpen.value) switchToDefaultDetailsTab();
    detailsOpen.value = true;
  }

  function clearFilters() {
    filters.value = emptyFilters();
    search.value = '';
  }

  return {
    sorting,
    columnSizing,
    columnVisibility,
    columnOrder,
    tableView,
    tagsInName,
    multiSelect,
    showSettingKeys,
    speedsInTitle,
    deleteFilesByDefault,
    speedUnit,
    sizeUnit,
    dateFormat,
    ratioColors,
    hideInfiniteEta,
    refreshInterval,
    filters,
    search,
    sidebarOpen,
    sidebarWidth,
    collapsedSidebarKeys,
    showAllSidebarSections,
    sidebarCountMode,
    detailsOpen,
    detailsHeight,
    autoSizeDetails,
    detailsTab,
    defaultDetailsTab,
    colorScheme,
    theme,
    updateFilterGroup,
    toggleFilterValue,
    switchToDefaultDetailsTab,
    expandDetails,
    clearFilters,
  };
});
