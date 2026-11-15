import { useStorage } from '@vueuse/core';
import { formatBytes } from '@/lib/format';
import { isAbsoluteHostPath } from '@/lib/hostPaths';
import type { NewTorrentOptions, TorrentFormat } from '@/types/app';
import { isValidWebSeedUrl, WEB_SEED_URL_RULE } from '@/features/details/webSeedUrls';

export interface CreatorForm {
  sourcePath: string;
  torrentFilePath: string;
  format: TorrentFormat;
  pieceSize: number;
  isPrivate: boolean;
  startSeeding: boolean;
  ignoreDotfiles: boolean;
  optimizeAlignment: boolean;
  /** KiB; empty disables padding by size. */
  paddedFileSizeLimitKib: string;
  trackers: string;
  webSeeds: string;
  comment: string;
  source: string;
}

type RememberedCreatorOptions = Omit<CreatorForm, 'sourcePath' | 'torrentFilePath' | 'comment'>;

const REMEMBERED_DEFAULTS: RememberedCreatorOptions = {
  format: 'hybrid',
  pieceSize: 0,
  isPrivate: false,
  startSeeding: true,
  ignoreDotfiles: true,
  optimizeAlignment: true,
  paddedFileSizeLimitKib: '',
  trackers: '',
  webSeeds: '',
  source: '',
};

export function useRememberedCreatorOptions() {
  return useStorage<RememberedCreatorOptions>(
    'slake:creatorOptions',
    REMEMBERED_DEFAULTS,
    undefined,
    {
      mergeDefaults: true,
    },
  );
}

export function initialCreatorForm(remembered: RememberedCreatorOptions): CreatorForm {
  return {
    ...REMEMBERED_DEFAULTS,
    ...remembered,
    sourcePath: '',
    torrentFilePath: '',
    comment: '',
  };
}

export function rememberedPart(form: CreatorForm): RememberedCreatorOptions {
  return Object.fromEntries(
    Object.keys(REMEMBERED_DEFAULTS).map((key) => [key, form[key as keyof CreatorForm]]),
  ) as RememberedCreatorOptions;
}

export const PIECE_SIZES = [0, ...Array.from({ length: 14 }, (_, i) => 1024 << (i + 4))];

export function pieceSizeLabel(bytes: number): string {
  return bytes ? formatBytes(bytes, 'binary').replace(/\.0+ /, ' ') : 'Automatic';
}

export const FORMAT_LABELS: Record<TorrentFormat, string> = {
  hybrid: 'Hybrid (v1 + v2)',
  v2: 'v2 only',
  v1: 'v1 only',
};

function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim());
}

/** Keeps one blank line between tiers, the way qBittorrent reads them. */
export function trackerTiers(text: string): string[] {
  const urls: string[] = [];
  for (const line of lines(text)) {
    if (line) urls.push(line);
    else if (urls.length && urls.at(-1) !== '') urls.push('');
  }
  if (urls.at(-1) === '') urls.pop();
  return urls;
}

export function webSeedList(text: string): string[] {
  return [...new Set(lines(text).filter(Boolean))];
}

export interface CreatorProblems {
  sourcePath?: string;
  torrentFilePath?: string;
  webSeeds?: string;
  paddedFileSizeLimit?: string;
}

const HOST_PATH_RULE = 'Enter a full path on the qBittorrent host.';

export function creatorProblems(form: CreatorForm): CreatorProblems {
  const problems: CreatorProblems = {};
  const sourcePath = form.sourcePath.trim();
  if (sourcePath && !isAbsoluteHostPath(sourcePath)) problems.sourcePath = HOST_PATH_RULE;
  const torrentFilePath = form.torrentFilePath.trim();
  if (torrentFilePath && !isAbsoluteHostPath(torrentFilePath))
    problems.torrentFilePath = HOST_PATH_RULE;
  const invalidSeeds = webSeedList(form.webSeeds).filter((url) => !isValidWebSeedUrl(url));
  if (invalidSeeds.length)
    problems.webSeeds = `${WEB_SEED_URL_RULE} Not valid: ${invalidSeeds.slice(0, 2).join(', ')}${invalidSeeds.length > 2 ? ` and ${invalidSeeds.length - 2} more` : ''}`;
  const padding = form.paddedFileSizeLimitKib.trim();
  if (padding && !(Number.isInteger(Number(padding)) && Number(padding) >= 0))
    problems.paddedFileSizeLimit = 'Enter a whole number of KiB, or leave it empty.';
  return problems;
}

export interface CreatorCapabilities {
  /** libtorrent 2 picks a format, 1.2 aligns files instead. Null while app/buildInfo is unknown. */
  isLibtorrent2: boolean | null;
  canIgnoreDotfiles: boolean;
}

export function toNewTorrentOptions(
  form: CreatorForm,
  capabilities: CreatorCapabilities,
): NewTorrentOptions {
  const options: NewTorrentOptions = {
    sourcePath: form.sourcePath.trim(),
    torrentFilePath: form.torrentFilePath.trim(),
    pieceSize: form.pieceSize,
    isPrivate: form.isPrivate,
    startSeeding: form.startSeeding,
    comment: form.comment.trim(),
    source: form.source.trim(),
    trackers: trackerTiers(form.trackers),
    webSeeds: webSeedList(form.webSeeds),
  };
  if (capabilities.isLibtorrent2 === true) {
    options.format = form.format;
  } else if (capabilities.isLibtorrent2 === false) {
    options.optimizeAlignment = form.optimizeAlignment;
    const padding = form.paddedFileSizeLimitKib.trim();
    options.paddedFileSizeLimit = form.optimizeAlignment && padding ? Number(padding) * 1024 : -1;
  }
  if (capabilities.canIgnoreDotfiles) options.ignoreDotfiles = form.ignoreDotfiles;
  return options;
}

export function isLibtorrent2(version: string | undefined): boolean | null {
  const major = Number.parseInt(version ?? '', 10);
  return Number.isNaN(major) ? null : major >= 2;
}
