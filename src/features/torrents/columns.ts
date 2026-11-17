import type { ColumnDef } from '@tanstack/vue-table';
import {
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/vue-table';
import type { Torrent } from '@/types/app';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatEta,
  formatSpeed,
  trackerHost,
} from '@/lib/format';

/**
 * TanStack Table owns columns only (headers, sort state, sizing, visibility, order).
 * Rows come from the torrents store, so it never builds a row model per poll.
 */
export const tableFeaturesConfig = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
});
export type Features = typeof tableFeaturesConfig;

export const MIN_COLUMN_WIDTH = 40;

export type CellKind =
  | 'text'
  | 'name'
  | 'progress'
  | 'status'
  | 'speed'
  | 'ratio'
  | 'swarm'
  | 'category'
  | 'tags'
  | 'relativeDate';

export interface TorrentColumnMeta {
  kind: CellKind;
  align?: 'right';
  text?: (t: Torrent) => string;
  title?: (t: Torrent) => string;
}

type Col = ColumnDef<Features, Torrent, unknown> & {
  accessorKey: keyof Torrent;
  meta: TorrentColumnMeta;
};

function col(
  accessorKey: keyof Torrent,
  header: string,
  size: number,
  meta: TorrentColumnMeta,
  extra: Partial<Col> = {},
): Col {
  return {
    accessorKey,
    id: accessorKey,
    header,
    size,
    minSize: MIN_COLUMN_WIDTH,
    // Numbers sort high-to-low first; text low-to-high.
    sortDescFirst: !!meta.align,
    meta,
    ...extra,
  } as Col;
}

const text = (read: (t: Torrent) => string, title?: (t: Torrent) => string) =>
  ({ kind: 'text', text: read, title }) as const;
const number = (read: (t: Torrent) => string) =>
  ({ kind: 'text', align: 'right', text: read }) as const;
const bytes = (field: 'downloadedSession' | 'uploadedSession' | 'completed') =>
  number((t) => formatBytes(t[field]));
const duration = (field: 'timeActive' | 'seedingTime' | 'reannounce') =>
  number((t) => formatDuration(t[field]));
const speedLimit = (field: 'dlLimit' | 'upLimit') =>
  number((t) => (t[field] > 0 ? formatSpeed(t[field]) : '∞'));
const path = (field: 'savePath' | 'downloadPath') =>
  text(
    (t) => t[field],
    (t) => t[field],
  );
const hash = (field: 'infohashV1' | 'infohashV2') => text((t) => t[field]);
const relativeDate = (
  field: 'addedOn' | 'completionOn' | 'lastActivity' | 'seenComplete' | 'creationDate',
) =>
  ({ kind: 'relativeDate', align: 'right', title: (t: Torrent) => formatDate(t[field]) }) as const;

export const torrentColumns: Col[] = [
  col('name', 'Name', 320, { kind: 'name' }, { enableHiding: false, minSize: 120 }),
  col(
    'size',
    'Size',
    76,
    number((t) => formatBytes(t.size)),
  ),
  col('progress', 'Progress', 96, { kind: 'progress', align: 'right' }),
  col('state', 'Status', 108, { kind: 'status' }),
  col('dlspeed', 'Down', 92, { kind: 'speed', align: 'right' }),
  col('upspeed', 'Up', 92, { kind: 'speed', align: 'right' }),
  col(
    'eta',
    'ETA',
    64,
    number((t) => (t.isComplete ? '' : formatEta(t.eta))),
  ),
  col('ratio', 'Ratio', 56, { kind: 'ratio', align: 'right' }),
  col('numSeeds', 'Seeds', 72, { kind: 'swarm', align: 'right' }),
  col('numLeechs', 'Peers', 72, { kind: 'swarm', align: 'right' }),
  col('category', 'Category', 92, { kind: 'category' }),
  col('tags', 'Tags', 140, { kind: 'tags' }),
  col('addedOn', 'Added', 76, relativeDate('addedOn')),
  col('completionOn', 'Completed', 84, relativeDate('completionOn')),
  col(
    'totalSize',
    'Total size',
    76,
    number((t) => formatBytes(t.totalSize)),
  ),
  col(
    'downloaded',
    'Downloaded',
    88,
    number((t) => formatBytes(t.downloaded)),
  ),
  col(
    'uploaded',
    'Uploaded',
    88,
    number((t) => formatBytes(t.uploaded)),
  ),
  col('downloadedSession', 'Session down', 96, bytes('downloadedSession')),
  col('uploadedSession', 'Session up', 96, bytes('uploadedSession')),
  col('completed', 'Completed size', 116, bytes('completed')),
  col(
    'amountLeft',
    'Remaining',
    88,
    number((t) => formatBytes(t.amountLeft)),
  ),
  col('savePath', 'Save path', 200, path('savePath')),
  col('downloadPath', 'Incomplete path', 200, path('downloadPath')),
  col(
    'tracker',
    'Tracker',
    140,
    text(
      (t) => trackerHost(t.tracker),
      (t) => t.tracker,
    ),
  ),
  col('lastActivity', 'Last activity', 92, relativeDate('lastActivity')),
  col(
    'availability',
    'Availability',
    80,
    number((t) => (t.availability < 0 ? '' : t.availability.toFixed(2))),
  ),
  col(
    'priority',
    'Queue',
    56,
    number((t) => (t.priority > 0 ? String(t.priority) : '')),
  ),
  col('timeActive', 'Time active', 84, duration('timeActive')),
  col('seedingTime', 'Seeding time', 100, duration('seedingTime')),
  col('dlLimit', 'Down limit', 88, speedLimit('dlLimit')),
  col('upLimit', 'Up limit', 88, speedLimit('upLimit')),
  col(
    'maxRatio',
    'Ratio limit',
    88,
    number((t) => (t.maxRatio < 0 ? '∞' : t.maxRatio.toFixed(2))),
  ),
  col('seenComplete', 'Seen complete', 112, relativeDate('seenComplete')),
  col('reannounce', 'Next announce', 112, duration('reannounce')),
  col(
    'popularity',
    'Popularity',
    76,
    number((t) => t.popularity.toFixed(2)),
  ),
  col(
    'private',
    'Private',
    56,
    text((t) => (t.private ? 'Yes' : '')),
  ),
  col('infohashV1', 'Info hash v1', 200, hash('infohashV1')),
  col('infohashV2', 'Info hash v2', 200, hash('infohashV2')),
  col('creationDate', 'Created', 76, relativeDate('creationDate')),
];

export const ESSENTIAL_COLUMNS = new Set([
  'name',
  'size',
  'progress',
  'state',
  'dlspeed',
  'upspeed',
  'eta',
  'ratio',
  'tags',
  'addedOn',
]);

export const DEFAULT_HIDDEN_COLUMNS: Record<string, boolean> = Object.fromEntries(
  torrentColumns.filter((c) => !ESSENTIAL_COLUMNS.has(c.id!)).map((c) => [c.id!, false]),
);

const SORT_LABELS: Record<string, string> = {
  dlspeed: 'Download speed',
  upspeed: 'Upload speed',
  addedOn: 'Added on',
  completionOn: 'Completed on',
  creationDate: 'Created on',
  downloadedSession: 'Downloaded this session',
  uploadedSession: 'Uploaded this session',
  dlLimit: 'Download limit',
  upLimit: 'Upload limit',
  priority: 'Queue position',
};

export const COMMON_SORT_FIELD_IDS = [
  'addedOn',
  'name',
  'size',
  'progress',
  'state',
  'dlspeed',
  'upspeed',
  'eta',
  'ratio',
];

export const SORTABLE_FIELDS = torrentColumns.map((c) => ({
  id: c.id!,
  label: SORT_LABELS[c.id!] ?? String(c.header),
  descFirst: c.sortDescFirst === true,
}));

export const COMMON_SORT_FIELDS = COMMON_SORT_FIELD_IDS.map((id) =>
  SORTABLE_FIELDS.find((field) => field.id === id)!,
);
export const OTHER_SORT_FIELDS = SORTABLE_FIELDS.filter(
  (field) => !COMMON_SORT_FIELD_IDS.includes(field.id),
);

export function reorderColumns(
  savedOrder: readonly string[],
  movedId: string,
  targetId: string,
  side: 'before' | 'after',
): string[] {
  const allIds = torrentColumns.map((c) => c.id!);
  const known = new Set(allIds);
  const order = [...savedOrder.filter((id) => known.has(id))];
  for (const id of allIds) if (!order.includes(id)) order.push(id);
  if (movedId === targetId) return order;
  const withoutMoved = order.filter((id) => id !== movedId);
  const targetIndex = withoutMoved.indexOf(targetId);
  if (targetIndex < 0) return order;
  withoutMoved.splice(side === 'before' ? targetIndex : targetIndex + 1, 0, movedId);
  return withoutMoved;
}
