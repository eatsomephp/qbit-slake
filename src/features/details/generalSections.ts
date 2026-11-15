import { LIMIT_GLOBAL, LIMIT_NONE } from '@/constants/qbit';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatEta,
  formatRatio,
  formatSpeed,
  formatSpeedValue,
} from '@/lib/format';
import type { Torrent } from '@/types/app';
import type { RawTorrentProperties } from '@/types/qbit';
import { ratioClass } from '@/lib/ratioColors';

export interface Stat {
  label: string;
  value: string;
  detail?: string;
  hint?: string;
  tone?: string;
}

export interface StatGroup {
  title: string;
  stats: Stat[];
}

export interface IdentityField {
  label: string;
  value: string;
  mono?: boolean;
  isLink?: boolean;
}

const UNLIMITED = 'Unlimited';

const speedLimit = (bytesPerSecond: number) =>
  bytesPerSecond > 0 ? formatSpeedValue(bytesPerSecond) : UNLIMITED;

const shareLimit = (limit: number, format: (value: number) => string) =>
  limit === LIMIT_GLOBAL ? 'Global' : limit === LIMIT_NONE || limit < 0 ? UNLIMITED : format(limit);

const minutes = (value: number) => formatDuration(value * 60) || '0m';

const hasSessionTotal = (total: number, session: number) => session > 0 && session !== total;

function transferred(label: string, total: number, session: number): Stat {
  if (!hasSessionTotal(total, session)) return { label, value: formatBytes(total) };
  return {
    label,
    value: formatBytes(total),
    detail: `(${formatBytes(session)})`,
    hint: `${formatBytes(session)} this session`,
  };
}

const ofTotal = (total: number) => (total > 0 ? `of ${total.toLocaleString()}` : undefined);

const keepFilled = (stats: Stat[]): Stat[] =>
  stats
    .filter((stat) => stat.value !== '')
    .map((stat) => ({ ...stat, hint: stat.hint ?? [stat.value, stat.detail].join(' ').trim() }));

export function statGroups(t: Torrent, p: RawTorrentProperties | undefined): StatGroup[] {
  const isTransferring = !t.isComplete && !t.isStopped;
  const groups: StatGroup[] = [
    {
      title: 'Transfer',
      stats: [
        {
          label: 'Size',
          value: formatBytes(t.size),
          detail: t.size !== t.totalSize ? `of ${formatBytes(t.totalSize)}` : undefined,
        },
        p
          ? transferred('Downloaded', p.total_downloaded, p.total_downloaded_session)
          : { label: 'Downloaded', value: formatBytes(t.downloaded) },
        p
          ? transferred('Uploaded', p.total_uploaded, p.total_uploaded_session)
          : { label: 'Uploaded', value: formatBytes(t.uploaded) },
        { label: 'Ratio', value: formatRatio(t.ratio), tone: ratioClass(t.ratio) },
        { label: 'Wasted', value: p && p.total_wasted > 0 ? formatBytes(p.total_wasted) : '' },
      ],
    },
    {
      title: 'Network',
      stats: [
        {
          label: 'Download',
          value: formatSpeedValue(t.dlspeed),
          detail: p && p.dl_speed_avg > 0 ? `${formatSpeed(p.dl_speed_avg)} avg` : undefined,
          tone: t.dlspeed > 0 ? 'text-chart-download' : undefined,
        },
        {
          label: 'Upload',
          value: formatSpeedValue(t.upspeed),
          detail: p && p.up_speed_avg > 0 ? `${formatSpeed(p.up_speed_avg)} avg` : undefined,
          tone: t.upspeed > 0 ? 'text-chart-upload' : undefined,
        },
        {
          label: 'Seeds',
          value: t.numSeeds.toLocaleString(),
          detail: ofTotal(t.numComplete),
        },
        {
          label: 'Peers',
          value: t.numLeechs.toLocaleString(),
          detail: ofTotal(t.numIncomplete),
        },
        {
          label: 'Connections',
          value: p ? p.nb_connections.toLocaleString() : '',
          detail: p && p.nb_connections_limit > 0 ? `of ${p.nb_connections_limit}` : undefined,
        },
      ],
    },
    {
      title: 'Time',
      stats: [
        { label: 'ETA', value: isTransferring ? formatEta(t.eta) : '' },
        { label: 'Active', value: p ? formatDuration(p.time_elapsed) : '' },
        { label: 'Seeding', value: p ? formatDuration(p.seeding_time) : '' },
        { label: 'Reannounce in', value: p ? formatDuration(p.reannounce) : '' },
        { label: 'Seen complete', value: p ? formatDate(p.last_seen) : '' },
      ],
    },
    {
      title: 'Torrent',
      stats: [
        { label: 'Added', value: formatDate(t.addedOn) },
        { label: 'Completed', value: formatDate(t.completionOn) },
        { label: 'Created', value: p ? formatDate(p.creation_date) : '' },
        { label: 'Created by', value: p?.created_by ?? '' },
        { label: 'Private', value: (p?.is_private ?? p?.isPrivate ?? t.private) ? 'Yes' : 'No' },
      ],
    },
    {
      title: 'Limits',
      stats: [
        { label: 'Download', value: speedLimit(t.dlLimit) },
        { label: 'Upload', value: speedLimit(t.upLimit) },
        { label: 'Ratio', value: shareLimit(t.ratioLimit, (v) => v.toFixed(2)) },
        { label: 'Seeding time', value: shareLimit(t.seedingTimeLimit, minutes) },
        { label: 'Inactive seeding', value: shareLimit(t.inactiveSeedingTimeLimit, minutes) },
      ],
    },
  ];
  return groups.map((group) => ({ ...group, stats: keepFilled(group.stats) }));
}

export function identityFields(t: Torrent, p: RawTorrentProperties | undefined): IdentityField[] {
  const downloadPath = p?.download_path ?? '';
  const comment = p?.comment ?? '';
  const fields: IdentityField[] = [
    { label: 'Save path', value: t.savePath, mono: true },
    {
      label: 'Incomplete path',
      value: downloadPath !== t.savePath ? downloadPath : '',
      mono: true,
    },
    { label: 'Info hash v1', value: p?.infohash_v1 || t.hash, mono: true },
    { label: 'Info hash v2', value: p?.infohash_v2 ?? '', mono: true },
    { label: 'Comment', value: comment, isLink: /^https?:\/\/\S+$/.test(comment) },
  ];
  return fields.filter((field) => field.value !== '');
}
