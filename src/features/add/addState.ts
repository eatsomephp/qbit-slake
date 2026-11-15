import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  ContentLayout,
  LIMIT_GLOBAL,
  ShareLimitAction,
  ShareLimitsMode,
  StopCondition,
} from '@/constants/qbit';
import type { ShareLimits } from '@/types/app';

/** Pending input for the add dialog, shared by the button, drop zone, and magnet route. */
export const addRequest = reactive({
  open: false,
  text: '',
  files: [] as File[],
  /** Search plugin per URL, which fetches it for qBittorrent (search results). */
  downloaders: {} as Record<string, string>,
});

/** Opens the add dialog, appending to whatever it already holds. */
export function openAdd(
  init: { text?: string; files?: File[]; downloaders?: Record<string, string> } = {},
) {
  Object.assign(addRequest.downloaders, init.downloaders);
  if (init.text) appendAddText(init.text);
  if (init.files?.length) addFiles(init.files);
  addRequest.open = true;
}

export const fileKey = (file: File) => `${file.name}:${file.size}`;

export function appendAddText(text: string) {
  addRequest.text = addRequest.text ? `${addRequest.text.trimEnd()}\n${text}` : text;
}

export function addFiles(files: File[]) {
  const known = new Set(addRequest.files.map(fileKey));
  addRequest.files.push(...files.filter((file) => !known.has(fileKey(file))));
}

export function removeAddLines(matches: (line: string) => boolean) {
  addRequest.text = addRequest.text
    .split(/\r?\n/)
    .filter((line) => !matches(line.trim()))
    .join('\n');
}

export function resetAdd() {
  addRequest.text = '';
  addRequest.files = [];
  addRequest.downloaders = {};
}

export interface AddPrefs {
  savePath: string;
  category: string;
  tags: string[];
  stopped: boolean;
  sequential: boolean;
  firstLastPiecePrio: boolean;
  skipChecking: boolean;
  /** '' everywhere below: leave it to qBittorrent's preferences. */
  autoTmm: '' | 'manual' | 'automatic';
  contentLayout: '' | ContentLayout;
  stopCondition: '' | StopCondition;
  queuePosition: '' | 'top' | 'bottom';
  incompletePath: '' | 'off' | 'custom';
  downloadPath: string;
}

/** Per-add limits; deliberately not remembered, so a limit never silently carries over. */
export interface AddLimits {
  downloadKiB: string;
  uploadKiB: string;
  share: ShareLimits;
}

export function defaultAddLimits(): AddLimits {
  return {
    downloadKiB: '',
    uploadKiB: '',
    share: {
      ratioLimit: LIMIT_GLOBAL,
      seedingTimeLimit: LIMIT_GLOBAL,
      inactiveSeedingTimeLimit: LIMIT_GLOBAL,
      action: ShareLimitAction.Default,
      mode: ShareLimitsMode.Default,
    },
  };
}

export function kibToBytes(kib: string): number {
  const n = Number(kib);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024) : 0;
}

export function shareLimitsChanged(limits: ShareLimits): boolean {
  const defaults = defaultAddLimits().share;
  return (Object.keys(defaults) as (keyof ShareLimits)[]).some(
    (key) => limits[key] !== defaults[key],
  );
}

/** Last-used options, remembered across sessions. */
export function useAddPrefs() {
  return useStorage<AddPrefs>(
    'slake:addOptions',
    {
      savePath: '',
      category: '',
      tags: [],
      stopped: false,
      sequential: false,
      firstLastPiecePrio: false,
      skipChecking: false,
      autoTmm: '',
      contentLayout: '',
      stopCondition: '',
      queuePosition: '',
      incompletePath: '',
      downloadPath: '',
    },
    undefined,
    { mergeDefaults: true },
  );
}
