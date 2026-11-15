// log/main and log/peers for MockProvider: a startup burst, then a trickle of entries over time.

import { LogType } from '@/constants/qbit';
import type { RawLogEntry, RawPeerLogEntry } from '@/types/qbit';

const STARTUP: [LogType, string][] = [
  [LogType.Normal, 'qBittorrent v5.3.0 started. Process ID: 157'],
  [LogType.Info, 'Using config directory: /config/qBittorrent'],
  [
    LogType.Info,
    'Trying to listen on the following list of IP addresses: "0.0.0.0:6881,[::]:6881"',
  ],
  [LogType.Info, 'Peer ID: "-qB5300-"'],
  [LogType.Info, 'HTTP User-Agent: "qBittorrent/5.3.0"'],
  [LogType.Info, 'Distributed Hash Table (DHT) support: ON'],
  [LogType.Info, 'Local Peer Discovery support: ON'],
  [LogType.Info, 'Peer Exchange (PeX) support: ON'],
  [LogType.Normal, 'Successfully listening on IP. IP: "0.0.0.0". Port: "TCP/6881"'],
  [LogType.Normal, 'Successfully listening on IP. IP: "0.0.0.0". Port: "UTP/6881"'],
  [LogType.Warning, 'UPnP/NAT-PMP: Port mapping failure, message: "no router found"'],
  [LogType.Normal, 'Using custom WebUI. Location: "/webui".'],
  [LogType.Info, 'WebAPI login success. IP: ::ffff:192.168.65.1'],
];

const ONGOING: [LogType, string][] = [
  [LogType.Normal, 'Torrent download finished. Torrent: "debian-12.8.0-amd64-netinst.iso"'],
  [LogType.Info, 'Detected external IP. IP: "203.0.113.42"'],
  [
    LogType.Warning,
    'Failed to resume torrent. Torrent: "ubuntu-24.04.iso". Reason: "file not found"',
  ],
  [LogType.Normal, 'Added new torrent. Torrent: "fedora-41-x86_64.iso"'],
  [
    LogType.Critical,
    'File error alert. Torrent: "archlinux.iso". File: "/downloads/archlinux.iso". Reason: "No space left on device"',
  ],
  [LogType.Info, 'Removed torrent. Torrent: "old-release.iso"'],
];

const PEERS: [ip: string, blocked: boolean, reason: string][] = [
  ['198.51.100.23', true, 'IP filter'],
  ['203.0.113.77', true, 'filtered port (8999)'],
  ['2001:db8::4f2a', true, 'IP filter'],
  ['192.0.2.140', false, ''],
  ['198.51.100.9', true, 'privileged port (80)'],
  ['203.0.113.201', true, 'uTP is disabled'],
];

export class MockLog {
  private entries: RawLogEntry[] = [];
  private peers: RawPeerLogEntry[] = [];
  private lastAt = Date.now();
  private lastPeerAt = Date.now();

  constructor() {
    const now = Math.floor(Date.now() / 1000) - 3600;
    STARTUP.forEach(([type, message], i) => this.push(type, message, now + i));
    PEERS.forEach((_, i) => this.pushPeer(now + 600 + i * 300));
  }

  since(lastKnownId: number): RawLogEntry[] {
    // Roughly one new entry every few seconds.
    const nowMs = Date.now();
    while (nowMs - this.lastAt > 4000) {
      this.lastAt += 4000;
      const [type, message] = ONGOING[this.entries.length % ONGOING.length]!;
      this.push(type, message, Math.floor(this.lastAt / 1000));
    }
    return this.entries.filter((e) => e.id > lastKnownId).map((e) => ({ ...e }));
  }

  peersSince(lastKnownId: number): RawPeerLogEntry[] {
    const nowMs = Date.now();
    while (nowMs - this.lastPeerAt > 9000) {
      this.lastPeerAt += 9000;
      this.pushPeer(Math.floor(this.lastPeerAt / 1000));
    }
    return this.peers.filter((e) => e.id > lastKnownId).map((e) => ({ ...e }));
  }

  private pushPeer(timestamp: number) {
    const [ip, blocked, reason] = PEERS[this.peers.length % PEERS.length]!;
    this.peers.push({ id: this.peers.length, ip, timestamp, blocked, reason });
  }

  private push(type: LogType, message: string, timestamp: number) {
    this.entries.push({ id: this.entries.length, message, timestamp, type });
  }
}
