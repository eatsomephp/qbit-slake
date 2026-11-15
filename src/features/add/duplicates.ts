import type { Torrent } from '@/types/app';

const EXACT_TOPIC_KEY = /^xt(\.\d+)?$/i;
const EXACT_TOPIC = /^urn:(btih|btmh):(.+)$/i;
const SHA1_HEX = /^[0-9a-f]{40}$/i;
const SHA1_BASE32 = /^[a-z2-7]{32}$/i;
const SHA256_MULTIHASH = /^1220([0-9a-f]{64})$/i;
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const TORRENT_ID_LENGTH = 40;

function base32ToHex(text: string): string {
  let hex = '';
  let buffer = 0;
  let bufferedBits = 0;
  for (const char of text.toLowerCase()) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bufferedBits += 5;
    if (bufferedBits >= 8) {
      bufferedBits -= 8;
      hex += ((buffer >> bufferedBits) & 0xff).toString(16).padStart(2, '0');
      buffer &= (1 << bufferedBits) - 1;
    }
  }
  return hex;
}

export function infoHashesOfLink(link: string): string[] {
  if (!/^magnet:\?/i.test(link)) return [];
  const hashes: string[] = [];
  for (const [key, value] of new URLSearchParams(link.slice(link.indexOf('?') + 1))) {
    if (!EXACT_TOPIC_KEY.test(key)) continue;
    const [, scheme, id = ''] = EXACT_TOPIC.exec(value) ?? [];
    if (scheme?.toLowerCase() === 'btmh') {
      const sha256 = SHA256_MULTIHASH.exec(id)?.[1];
      if (sha256) hashes.push(sha256.toLowerCase());
    } else if (SHA1_HEX.test(id)) hashes.push(id.toLowerCase());
    else if (SHA1_BASE32.test(id)) hashes.push(base32ToHex(id));
  }
  return hashes;
}

interface TorrentLookup {
  get(hash: string): Torrent | undefined;
  readonly all: readonly Torrent[];
}

/**
 * qBittorrent's torrent ID is the v1 hash, or the v2 hash cut to 40 characters for v2-only
 * torrents. A hybrid torrent is keyed by its v1 hash, so a bare v2 hash needs the scan.
 */
export function findByInfoHash(hashes: readonly string[], torrents: TorrentLookup) {
  for (const hash of hashes) {
    const found =
      torrents.get(hash) ??
      (hash.length > TORRENT_ID_LENGTH
        ? (torrents.get(hash.slice(0, TORRENT_ID_LENGTH)) ??
          torrents.all.find((torrent) => torrent.infohashV2 === hash))
        : undefined);
    if (found) return found;
  }
  return undefined;
}
