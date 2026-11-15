import type { Peer } from './usePeers';

export type PeerSortId =
  | 'address'
  | 'hostName'
  | 'client'
  | 'connection'
  | 'flags'
  | 'progress'
  | 'downSpeed'
  | 'upSpeed'
  | 'downloaded'
  | 'uploaded'
  | 'relevance';

export interface PeerSort {
  id: PeerSortId;
  desc: boolean;
}

export interface PeerColumn {
  id: PeerSortId;
  label: string;
  isNumeric: boolean;
}

export const PEER_COLUMNS: PeerColumn[] = [
  { id: 'address', label: 'Address', isNumeric: false },
  { id: 'hostName', label: 'Host name', isNumeric: false },
  { id: 'client', label: 'Client', isNumeric: false },
  { id: 'connection', label: 'Connection', isNumeric: false },
  { id: 'flags', label: 'Flags', isNumeric: false },
  { id: 'progress', label: 'Progress', isNumeric: true },
  { id: 'downSpeed', label: 'Down', isNumeric: true },
  { id: 'upSpeed', label: 'Up', isNumeric: true },
  { id: 'downloaded', label: 'Downloaded', isNumeric: true },
  { id: 'uploaded', label: 'Uploaded', isNumeric: true },
  { id: 'relevance', label: 'Relevance', isNumeric: true },
];

export const DEFAULT_PEER_SORT: PeerSort = { id: 'downSpeed', desc: true };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const SORT_VALUE: Record<PeerSortId, (peer: Peer) => string | number> = {
  address: (p) => p.key,
  hostName: (p) => p.host_name ?? '',
  client: (p) => p.client,
  connection: (p) => p.connection,
  flags: (p) => p.flags,
  progress: (p) => p.progress,
  downSpeed: (p) => p.dl_speed,
  upSpeed: (p) => p.up_speed,
  downloaded: (p) => p.downloaded,
  uploaded: (p) => p.uploaded,
  relevance: (p) => p.relevance,
};

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
}

export function sortPeers(peers: readonly Peer[], sort: PeerSort): Peer[] {
  const value = SORT_VALUE[sort.id];
  const direction = sort.desc ? -1 : 1;
  return peers
    .slice()
    .sort(
      (a, b) =>
        direction * compareValues(value(a), value(b)) ||
        b.dl_speed + b.up_speed - (a.dl_speed + a.up_speed) ||
        collator.compare(a.key, b.key),
    );
}

export function nextPeerSort(current: PeerSort, column: PeerColumn): PeerSort {
  if (current.id === column.id) return { id: column.id, desc: !current.desc };
  return { id: column.id, desc: column.isNumeric };
}
