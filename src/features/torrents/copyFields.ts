import type { Torrent } from '@/types/app';

export interface CopyField {
  label: string;
  key: string;
  value: (t: Torrent) => string;
}

export const COPY_FIELDS: CopyField[] = [
  { label: 'Name', key: 'y', value: (t) => t.name },
  { label: 'Info hash v1', key: 'h', value: (t) => t.infohashV1 },
  { label: 'Info hash v2', key: 'H', value: (t) => t.infohashV2 },
  { label: 'Magnet link', key: 'm', value: (t) => t.magnetUri },
  { label: 'Torrent ID', key: 'i', value: (t) => t.hash },
  { label: 'Comment', key: 'c', value: (t) => t.comment },
  { label: 'Content path', key: 'p', value: (t) => t.contentPath },
];

export function copyTextOf(field: CopyField, torrents: readonly Torrent[]): string {
  return torrents.map(field.value).filter(Boolean).join('\n');
}
