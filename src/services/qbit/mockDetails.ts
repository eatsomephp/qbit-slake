// Detail-drawer data for MockProvider: properties, trackers, web seeds, files and peers.
// Uses its own faker instance, seeded per torrent, so details stay stable per hash
// and don't disturb the main simulation.

import { Faker, base, en } from '@faker-js/faker';
import { FilePriority, PieceState, TrackerStatus } from '@/constants/qbit';
import type {
  PeersResponse,
  RawPeer,
  RawTorrent,
  RawTorrentFile,
  RawTorrentProperties,
  RawTracker,
  RawWebSeed,
} from '@/types/qbit';
import type { TorrentMetadata, TrackerChanges } from '@/types/app';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { QbtHttpError } from './http';

const CLIENTS = [
  'qBittorrent 5.1.2',
  'Transmission 4.0.6',
  'Deluge 2.1.1',
  'libtorrent/2.0.11',
  'rTorrent 0.10.0',
];
const COUNTRIES: [string, string][] = [
  ['Germany', 'de'],
  ['United States', 'us'],
  ['France', 'fr'],
  ['Netherlands', 'nl'],
  ['Japan', 'jp'],
  ['Canada', 'ca'],
  ['Sweden', 'se'],
];

function mockHostName(ip: string, countryCode: string): string {
  return `${ip.replaceAll(/[.:]/g, '-')}.dyn.example.${countryCode}`;
}

const WEB_SEED_SCHEMES = new Set(['http:', 'https:', 'ftp:']);

function validWebSeedUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new QbtHttpError(400, `"${url}" is not a valid URL`);
  }
  if (!WEB_SEED_SCHEMES.has(parsed.protocol))
    throw new QbtHttpError(400, 'URL scheme must be one of [http, https, ftp]');
  return url;
}

function hashOfText(text: string): string {
  let state = 2166136261;
  let hex = '';
  for (let round = 0; hex.length < 40; round++) {
    for (const char of `${text}#${round}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    hex += (state >>> 0).toString(16).padStart(8, '0');
  }
  return hex.slice(0, 40);
}

function seedFor(hash: string): number {
  return parseInt(hash.slice(0, 8), 16) || 1;
}

function pieceSize(total: number): number {
  let size = 256 * 1024;
  while (total / size > 2000 && size < 16 * 1024 * 1024) size *= 2;
  return size;
}

function newTracker(url: string, tier: number): RawTracker {
  return {
    url,
    status: TrackerStatus.NotContacted,
    tier,
    num_peers: -1,
    num_seeds: -1,
    num_leeches: -1,
    num_downloaded: -1,
    msg: '',
  };
}

interface PeerState {
  rid: number;
  peers: Map<string, RawPeer>;
  addedSinceLastDiff: Set<string>;
  removedSinceLastDiff: Set<string>;
}

export class MockDetails {
  // Created per instance, not at module level: a top-level `new Faker()` is a side
  // effect that would keep faker in the production bundle even when mocks are unused.
  private f = new Faker({ locale: [en, base] });
  private files = new Map<string, RawTorrentFile[]>();
  private peers = new Map<string, PeerState>();
  private trackerLists = new Map<string, RawTracker[]>();
  private webSeedLists = new Map<string, string[]>();

  properties(hash: string, t: RawTorrent): RawTorrentProperties {
    this.f.seed(seedFor(hash));
    const piece = pieceSize(t.total_size);
    const piecesNum = Math.ceil(t.total_size / piece);
    const now = Math.floor(Date.now() / 1000);
    return {
      addition_date: t.added_on,
      comment: t.comment,
      completion_date: t.completion_on,
      created_by: this.f.helpers.arrayElement([
        'qBittorrent v5.0.4',
        'mktorrent 1.1',
        'Transmission/4.0.6',
      ]),
      creation_date: t.added_on - this.f.number.int({ min: 3600, max: 90 * 86_400 }),
      dl_limit: t.dl_limit,
      dl_speed: t.dlspeed,
      dl_speed_avg: Math.round(t.downloaded / Math.max(now - t.added_on, 1)),
      download_path: '',
      eta: t.eta,
      hash,
      infohash_v1: hash,
      infohash_v2: '',
      is_private: t.private === true,
      last_seen: t.progress >= 1 ? now : now - this.f.number.int(86_400),
      name: t.name,
      nb_connections: t.num_seeds + t.num_leechs,
      nb_connections_limit: 100,
      peers: t.num_leechs,
      peers_total: t.num_incomplete,
      piece_size: piece,
      pieces_have: Math.floor(piecesNum * t.progress),
      pieces_num: piecesNum,
      reannounce: this.f.number.int({ min: 60, max: 1800 }),
      save_path: t.save_path,
      seeding_time: t.progress >= 1 ? Math.max(now - t.completion_on, 0) : 0,
      seeds: t.num_seeds,
      seeds_total: t.num_complete,
      share_ratio: t.ratio,
      time_elapsed: Math.max(now - t.added_on, 0),
      total_downloaded: t.downloaded,
      total_downloaded_session: Math.round(t.downloaded * 0.1),
      total_size: t.total_size,
      total_uploaded: t.uploaded,
      total_uploaded_session: Math.round(t.uploaded * 0.1),
      total_wasted: this.f.number.int({ min: 0, max: 5_000_000 }),
      up_limit: t.up_limit,
      up_speed: t.upspeed,
      up_speed_avg: Math.round(t.uploaded / Math.max(now - t.added_on, 1)),
    };
  }

  trackers(hash: string, t: RawTorrent): RawTracker[] {
    this.f.seed(seedFor(hash));
    const pseudo = (url: string, status: TrackerStatus): RawTracker => ({
      url,
      status,
      tier: -1,
      num_peers: status === TrackerStatus.Working ? this.f.number.int(40) : 0,
      num_seeds: -1,
      num_leeches: -1,
      num_downloaded: -1,
      msg: t.private && status === TrackerStatus.Disabled ? 'This torrent is private' : '',
    });
    const off = t.private ? TrackerStatus.Disabled : TrackerStatus.Working;
    return [
      pseudo('** [DHT] **', off),
      pseudo('** [PeX] **', off),
      pseudo('** [LSD] **', off),
      ...this.realTrackers(hash, t).map((tracker) => ({ ...tracker })),
    ];
  }

  addTrackers(hash: string, t: RawTorrent, urls: string) {
    const list = this.realTrackers(hash, t);
    let tier = 0;
    for (const line of urls.split('\n')) {
      const url = line.trim();
      if (!url) tier++;
      else if (!list.some((tracker) => tracker.url === url)) list.push(newTracker(url, tier));
    }
  }

  editTracker(hash: string, t: RawTorrent, url: string, changes: TrackerChanges) {
    const list = this.realTrackers(hash, t);
    const tracker = list.find((entry) => entry.url === url);
    if (!tracker) throw new QbtHttpError(409, 'Tracker not found');
    if (changes.newUrl !== undefined && changes.newUrl !== url) {
      if (list.some((entry) => entry.url === changes.newUrl))
        throw new QbtHttpError(409, 'New tracker URL already exists');
      Object.assign(tracker, newTracker(changes.newUrl, tracker.tier));
    }
    if (changes.tier !== undefined) tracker.tier = changes.tier;
  }

  removeTrackers(hash: string, t: RawTorrent, urls: string[]) {
    this.trackerLists.set(
      hash,
      this.realTrackers(hash, t).filter((tracker) => !urls.includes(tracker.url)),
    );
  }

  realTrackerUrls(hash: string, t: RawTorrent): string[] {
    return this.realTrackers(hash, t).map((tracker) => tracker.url);
  }

  private realTrackers(hash: string, t: RawTorrent): RawTracker[] {
    let list = this.trackerLists.get(hash);
    if (!list) {
      this.f.seed(seedFor(hash));
      const working = this.f.number.float() > 0.15;
      list = [
        {
          url: t.tracker,
          status: working ? TrackerStatus.Working : TrackerStatus.NotWorking,
          tier: 0,
          num_peers: t.num_incomplete,
          num_seeds: t.num_complete,
          num_leeches: t.num_incomplete,
          num_downloaded: this.f.number.int(5000),
          msg: working ? '' : 'Connection timed out',
        },
      ];
      this.trackerLists.set(hash, list);
    }
    return list;
  }

  webSeeds(hash: string, t: RawTorrent): RawWebSeed[] {
    return this.webSeedUrls(hash, t).map((url) => ({ url }));
  }

  addWebSeeds(hash: string, t: RawTorrent, urls: string[]) {
    const list = this.webSeedUrls(hash, t);
    for (const url of urls.map(validWebSeedUrl)) if (!list.includes(url)) list.push(url);
  }

  editWebSeed(hash: string, t: RawTorrent, url: string, newUrl: string) {
    validWebSeedUrl(newUrl);
    if (newUrl === url) return;
    const list = this.webSeedUrls(hash, t);
    const index = list.indexOf(url);
    if (index < 0) throw new QbtHttpError(409, `"${url}" is not an existing URL`);
    list.splice(index, 1);
    if (!list.includes(newUrl)) list.push(newUrl);
  }

  removeWebSeeds(hash: string, t: RawTorrent, urls: string[]) {
    urls.forEach(validWebSeedUrl);
    this.webSeedLists.set(
      hash,
      this.webSeedUrls(hash, t).filter((url) => !urls.includes(url)),
    );
  }

  private webSeedUrls(hash: string, t: RawTorrent): string[] {
    let list = this.webSeedLists.get(hash);
    if (!list) {
      this.f.seed(seedFor(hash));
      const slug = encodeURIComponent(t.name);
      list =
        this.f.number.float() < 0.2
          ? [`https://mirror.example.org/${slug}/`, `http://ftp.example.net/pub/${slug}/`].slice(
              0,
              this.f.number.int({ min: 1, max: 2 }),
            )
          : [];
      this.webSeedLists.set(hash, list);
    }
    return list;
  }

  fileList(hash: string, t: RawTorrent): RawTorrentFile[] {
    let list = this.files.get(hash);
    if (!list) {
      list = this.generateFiles(hash, t);
      this.files.set(hash, list);
    }
    // Progress follows the torrent; skipped files stay where they were.
    for (const file of list) {
      if (file.priority !== FilePriority.DoNotDownload)
        file.progress = Math.min(t.progress * 1.02, 1);
    }
    return list.map((file) => ({ ...file }));
  }

  metadata(source: string, name: string): TorrentMetadata {
    const hash = /urn:btih:([0-9a-f]{40})/i.exec(source)?.[1]?.toLowerCase() ?? hashOfText(source);
    this.f.seed(seedFor(hash));
    const totalSize = this.f.number.int({ min: 300_000_000, max: 8_000_000_000 });
    const files = this.generateFiles(hash, { ...DEFAULT_RAW_TORRENT, name, total_size: totalSize });
    return {
      infoHashV1: hash,
      infoHashV2: '',
      name,
      size: totalSize,
      files: files.map((file) => ({
        path: file.name,
        size: file.size,
        priority: file.name.endsWith('.nfo') ? FilePriority.DoNotDownload : FilePriority.Normal,
      })),
      isPrivate: false,
      comment: '',
    };
  }

  adoptMetadata(hash: string, metadata: TorrentMetadata, priorities: number[] | undefined) {
    let offset = 0;
    const piece = pieceSize(metadata.size);
    this.files.set(
      hash,
      metadata.files.map((file, index) => {
        const first = Math.floor(offset / piece);
        offset += file.size;
        return {
          index,
          name: file.path,
          size: file.size,
          progress: 0,
          priority: priorities?.[index] ?? file.priority,
          is_seed: false,
          piece_range: [first, Math.max(first, Math.ceil(offset / piece) - 1)],
          availability: 1,
        };
      }),
    );
  }

  setPriority(hash: string, t: RawTorrent, indexes: number[], priority: number) {
    const list = this.fileList(hash, t) && this.files.get(hash)!;
    for (const file of list) if (indexes.includes(file.index)) file.priority = priority;
  }

  fileDownloadUrl(hash: string, t: RawTorrent, index: number): string {
    const file = this.fileList(hash, t).find((f) => f.index === index);
    if (!file) throw new QbtHttpError(409, `File index ${index} is out of bounds`);
    if (file.progress < 1) throw new QbtHttpError(409, 'File not fully downloaded');
    const url = URL.createObjectURL(new Blob([`Mock contents of ${file.name}\n`]));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return url;
  }

  rename(hash: string, t: RawTorrent, oldPath: string, newPath: string, folder: boolean) {
    const list = this.fileList(hash, t) && this.files.get(hash)!;
    for (const file of list) {
      if (folder && file.name.startsWith(`${oldPath}/`)) {
        file.name = newPath + file.name.slice(oldPath.length);
      } else if (!folder && file.name === oldPath) {
        file.name = newPath;
      }
    }
  }

  pieceStates(hash: string, t: RawTorrent): number[] {
    this.f.seed(seedFor(hash));
    const n = Math.max(1, Math.ceil(t.total_size / pieceSize(t.total_size)));
    if (t.progress >= 1) return new Array<number>(n).fill(PieceState.Downloaded);
    // Mostly in order, with some scatter, plus a few in flight while downloading.
    const states = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const have = p < t.progress * 0.8 || this.f.number.float() < t.progress * 0.3;
      states[i] = have ? PieceState.Downloaded : PieceState.Missing;
    }
    if (t.dlspeed > 0) {
      for (let k = 0; k < Math.min(8, n); k++) {
        const i = Math.floor(Math.random() * n);
        if (states[i] === PieceState.Missing) states[i] = PieceState.Downloading;
      }
    }
    return states;
  }

  pieceAvailability(hash: string, t: RawTorrent): number[] {
    this.f.seed(seedFor(hash));
    const n = Math.max(1, Math.ceil(t.total_size / pieceSize(t.total_size)));
    const peers = t.num_seeds + t.num_leechs;
    const counts = new Array<number>(n);
    let level = this.f.number.int({ min: 0, max: peers });
    for (let i = 0; i < n; i++) {
      if (this.f.number.float() < 0.02) level = this.f.number.int({ min: 0, max: peers });
      counts[i] = Math.max(0, level + this.f.number.int({ min: -1, max: 1 }));
    }
    return counts;
  }

  peerDiff(hash: string, t: RawTorrent, rid: number): PeersResponse {
    const full = rid === 0 || rid !== this.peers.get(hash)?.rid;
    const state = this.peerState(hash, t);

    const changed: Record<string, Partial<RawPeer>> = {};
    const removed: string[] = [...state.removedSinceLastDiff];
    state.removedSinceLastDiff.clear();
    if (!full) {
      for (const key of state.addedSinceLastDiff) {
        const peer = state.peers.get(key);
        if (peer) changed[key] = { ...peer };
      }
      for (const [key, p] of state.peers) {
        if (Math.random() < 0.4) {
          const dl = Math.round(Math.random() * (t.dlspeed / Math.max(state.peers.size, 1)) * 2);
          const up = Math.round(Math.random() * (t.upspeed / Math.max(state.peers.size, 1)) * 2);
          p.dl_speed = dl;
          p.up_speed = up;
          p.downloaded += dl;
          p.uploaded += up;
          p.progress = Math.min(p.progress + Math.random() * 0.01, 1);
          changed[key] = {
            dl_speed: dl,
            up_speed: up,
            downloaded: p.downloaded,
            uploaded: p.uploaded,
            progress: p.progress,
          };
        }
      }
      if (Math.random() < 0.2) {
        const key = this.addPeer(state, t);
        changed[key] = { ...state.peers.get(key)! };
      }
      if (state.peers.size > 0 && Math.random() < 0.15) {
        const key = [...state.peers.keys()][Math.floor(Math.random() * state.peers.size)]!;
        state.peers.delete(key);
        delete changed[key];
        removed.push(key);
      }
    }

    state.addedSinceLastDiff.clear();
    state.rid += 1;
    if (full) {
      return {
        rid: state.rid,
        full_update: true,
        show_flags: true,
        peers: Object.fromEntries([...state.peers].map(([k, p]) => [k, { ...p }])),
      };
    }
    const res: PeersResponse = { rid: state.rid };
    if (Object.keys(changed).length) res.peers = changed;
    if (removed.length) res.peers_removed = removed;
    return res;
  }

  addPeers(hash: string, t: RawTorrent, addresses: string[]): void {
    const state = this.peerState(hash, t);
    for (const address of addresses) {
      const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(address);
      if (!match) continue;
      const key = this.addPeer(state, t, match[1], Number(match[2]));
      state.addedSinceLastDiff.add(key);
    }
  }

  /** Returns the banned IPs. */
  banPeers(addresses: string[]): string[] {
    const ips = addresses.map((address) => address.replace(/^\[?([^\]]+?)\]?:\d+$/, '$1'));
    for (const state of this.peers.values()) {
      for (const [key, peer] of state.peers) {
        if (!ips.includes(peer.ip)) continue;
        state.peers.delete(key);
        state.addedSinceLastDiff.delete(key);
        state.removedSinceLastDiff.add(key);
      }
    }
    return ips;
  }

  private peerState(hash: string, t: RawTorrent): PeerState {
    let state = this.peers.get(hash);
    if (state) return state;
    this.f.seed(seedFor(hash));
    state = {
      rid: 0,
      peers: new Map(),
      addedSinceLastDiff: new Set(),
      removedSinceLastDiff: new Set(),
    };
    const n = Math.min(t.num_seeds + t.num_leechs, 60) || this.f.number.int({ min: 0, max: 8 });
    for (let i = 0; i < n; i++) this.addPeer(state, t);
    this.peers.set(hash, state);
    return state;
  }

  private addPeer(
    state: PeerState,
    t: RawTorrent,
    ip = this.f.internet.ipv4(),
    port = this.f.internet.port(),
  ): string {
    const [country, code] = this.f.helpers.arrayElement(COUNTRIES);
    const seed = this.f.datatype.boolean();
    const peer: RawPeer = {
      client: this.f.helpers.arrayElement(CLIENTS),
      connection: this.f.helpers.arrayElement(['BT', 'μTP']),
      country,
      country_code: code,
      dl_speed: 0,
      downloaded: this.f.number.int(t.size / 10 || 1),
      files: '',
      flags: seed ? 'D I H' : 'u U X',
      flags_desc: seed
        ? 'D = Downloading (interested and not choked)\nI = Incoming connection\nH = Peer from DHT'
        : 'u = Peer is interested but not choked\nU = Uploading\nX = Peer from PeX',
      host_name: this.f.datatype.boolean() ? mockHostName(ip, code) : '',
      ip,
      port,
      progress: seed ? 1 : this.f.number.float({ min: 0, max: 0.99 }),
      relevance: this.f.number.float({ min: 0, max: 1 }),
      up_speed: 0,
      uploaded: this.f.number.int(t.size / 10 || 1),
    };
    const key = ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`;
    state.peers.set(key, peer);
    return key;
  }

  private generateFiles(hash: string, t: RawTorrent): RawTorrentFile[] {
    this.f.seed(seedFor(hash));
    const names: string[] = [];
    if (t.name.endsWith('.iso') || t.category === 'linux') {
      names.push(t.name);
    } else if (t.category === 'music') {
      const tracks = this.f.number.int({ min: 8, max: 14 });
      for (let i = 1; i <= tracks; i++) {
        names.push(`${t.name}/${String(i).padStart(2, '0')} - ${this.f.music.songName()}.flac`);
      }
      names.push(`${t.name}/cover.jpg`);
    } else if (t.category === 'books') {
      names.push(`${t.name}.epub`);
    } else {
      names.push(`${t.name}/${t.name}.mkv`);
      names.push(`${t.name}/Subs/English.srt`, `${t.name}/Subs/Spanish.srt`);
      names.push(`${t.name}/Sample/sample.mkv`, `${t.name}/${t.name}.nfo`);
    }

    // Split the size: the first file takes most of it.
    const weights = names.map((_, i) =>
      i === 0 ? 50 : this.f.number.float({ min: 0.01, max: 3 }),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    const piece = pieceSize(t.total_size);
    let offset = 0;
    return names.map((name, index) => {
      const size =
        index === names.length - 1
          ? t.total_size - offset
          : Math.floor((t.total_size * weights[index]!) / sum);
      const first = Math.floor(offset / piece);
      offset += size;
      return {
        index,
        name,
        size,
        progress: t.progress,
        priority: FilePriority.Normal,
        is_seed: t.progress >= 1,
        piece_range: [first, Math.max(first, Math.ceil(offset / piece) - 1)],
        availability: t.progress >= 1 ? -1 : this.f.number.float({ min: 0.5, max: 12 }),
      };
    });
  }
}
