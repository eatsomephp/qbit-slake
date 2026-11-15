import type { RawPeer } from '@/types/qbit';

export function peerAddress(peer: Pick<RawPeer, 'ip' | 'port'>): string {
  return peer.ip.includes(':') ? `[${peer.ip}]:${peer.port}` : `${peer.ip}:${peer.port}`;
}

const IPV4_WITH_PORT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/;
const IPV6_WITH_PORT = /^\[([0-9a-f:.]+)\]:(\d{1,5})$/i;

function isValidPort(port: string): boolean {
  const n = Number(port);
  return n >= 1 && n <= 65535;
}

export function isValidPeerAddress(address: string): boolean {
  const v4 = IPV4_WITH_PORT.exec(address);
  if (v4) return v4.slice(1, 5).every((octet) => Number(octet) <= 255) && isValidPort(v4[5]!);
  const v6 = IPV6_WITH_PORT.exec(address);
  return !!v6 && v6[1]!.includes(':') && isValidPort(v6[2]!);
}

/** One `ip:port` per line (or separated by spaces or commas); duplicates are dropped. */
export function parsePeerList(text: string): { peers: string[]; invalid: string[] } {
  const entries = [...new Set(text.split(/[\s,]+/).filter(Boolean))];
  return {
    peers: entries.filter(isValidPeerAddress),
    invalid: entries.filter((entry) => !isValidPeerAddress(entry)),
  };
}
