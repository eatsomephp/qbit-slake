import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMaindata, createSyncState } from '@/sync/merge';
import type { IProvider } from './IProvider';
import { MockProvider } from './MockProvider';
import { ShareLimitAction, ShareLimitsMode } from '@/constants/qbit';

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') }));
afterEach(() => vi.useRealTimers());

describe('MockProvider', () => {
  it('returns a full snapshot for rid 0 with the requested number of torrents', async () => {
    const mock = new MockProvider(200);
    const data = await mock.getMaindata(0);
    expect(data.full_update).toBe(true);
    expect(Object.keys(data.torrents!)).toHaveLength(200);
    expect(data.categories).toBeDefined();
    expect(data.server_state?.connection_status).toBe('connected');
    const tracked = Object.values(data.trackers!).flat();
    expect(tracked).toHaveLength(200);
  });

  it('returns diffs for the last served rid and a full update for a stale one', async () => {
    const mock = new MockProvider(50);
    const first = await mock.getMaindata(0);
    vi.advanceTimersByTime(1500);
    const diff = await mock.getMaindata(first.rid);
    expect(diff.full_update).toBeUndefined();
    expect(diff.rid).toBe(first.rid + 1);

    const stale = await mock.getMaindata(first.rid);
    expect(stale.full_update).toBe(true);
  });

  it('produces diffs that keep a merged client view in sync with a fresh snapshot', async () => {
    const mock = new MockProvider(300);
    const client = createSyncState();
    let data = await mock.getMaindata(0);
    applyMaindata(client, data);
    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(1500);
      data = await mock.getMaindata(data.rid);
      applyMaindata(client, data);
    }

    const truth = createSyncState();
    applyMaindata(truth, await mock.getMaindata(-1));
    expect([...client.torrents.keys()].sort()).toEqual([...truth.torrents.keys()].sort());
    for (const [hash, t] of truth.raw) expect(client.raw.get(hash)).toEqual(t);
    expect(client.trackers).toEqual(truth.trackers);
  });
});

describe('MockProvider actions', () => {
  it('stop, start, recheck and delete show up in the next diff', async () => {
    const mock = new MockProvider(30);
    const client = createSyncState();
    let data = await mock.getMaindata(0);
    applyMaindata(client, data);
    const [a, b] = [...client.torrents.keys()] as [string, string];

    await mock.stopTorrents([a]);
    await mock.deleteTorrents([b]);
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.torrents.get(a)!.isStopped).toBe(true);
    expect(client.torrents.has(b)).toBe(false);

    await mock.startTorrents([a]);
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.torrents.get(a)!.isStopped).toBe(false);

    await mock.recheckTorrents([a]);
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.torrents.get(a)!.isChecking).toBe(true);
    vi.advanceTimersByTime(5000);
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.torrents.get(a)!.isChecking).toBe(false);
  });
});

describe('MockProvider details', () => {
  it('serves properties, trackers and files for a known hash, 404 otherwise', async () => {
    const mock = new MockProvider(5);
    const data = await mock.getMaindata(0);
    const hash = Object.keys(data.torrents!)[0]!;
    const props = await mock.getProperties(hash);
    expect(props.hash).toBe(hash);
    expect(props.pieces_num).toBeGreaterThan(0);
    const trackers = await mock.getTrackers(hash);
    expect(trackers.slice(0, 3).map((t) => t.url)).toEqual([
      '** [DHT] **',
      '** [PeX] **',
      '** [LSD] **',
    ]);
    const files = await mock.getFiles(hash);
    expect(files.reduce((s, f) => s + f.size, 0)).toBe(data.torrents![hash]!.total_size);
    await expect(mock.getFiles('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('applies file priority and renames', async () => {
    const mock = new MockProvider(5);
    const data = await mock.getMaindata(0);
    const hash = Object.keys(data.torrents!)[0]!;
    const [first] = await mock.getFiles(hash);
    await mock.setFilePriority(hash, [first!.index], 0);
    await mock.renameFile(hash, first!.name, 'renamed.bin');
    const after = (await mock.getFiles(hash))[0]!;
    expect(after.priority).toBe(0);
    expect(after.name).toBe('renamed.bin');
  });

  it('peers: full snapshot for rid 0, then diffs', async () => {
    const mock = new MockProvider(5);
    const data = await mock.getMaindata(0);
    const hash = Object.keys(data.torrents!)[0]!;
    const full = await mock.getPeers(hash, 0);
    expect(full.full_update).toBe(true);
    const diff = await mock.getPeers(hash, full.rid);
    expect(diff.full_update).toBeUndefined();
    expect(diff.rid).toBe(full.rid + 1);
  });
});

describe('MockProvider organisation', () => {
  it('category and tag changes reach the client through diffs', async () => {
    const mock = new MockProvider(10);
    const client = createSyncState();
    let data = await mock.getMaindata(0);
    applyMaindata(client, data);
    const [a] = [...client.torrents.keys()] as [string];

    await mock.createCategory('iso', { savePath: '/dl/iso' });
    await mock.setCategory([a], 'iso');
    await mock.addTags([a], ['fresh']);
    await mock.setShareLimits([a], {
      ratioLimit: 2,
      seedingTimeLimit: -1,
      inactiveSeedingTimeLimit: -2,
      action: ShareLimitAction.Remove,
      mode: ShareLimitsMode.MatchAll,
    });
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.categories.get('iso')).toEqual({ name: 'iso', savePath: '/dl/iso' });
    expect(client.tags.has('fresh')).toBe(true);
    expect(client.torrents.get(a)).toMatchObject({
      category: 'iso',
      ratioLimit: 2,
      shareLimitAction: 'Remove',
      shareLimitsMode: 'MatchAll',
    });
    expect(client.torrents.get(a)!.tags).toContain('fresh');

    await mock.removeCategories(['iso']);
    await mock.deleteTags(['fresh']);
    data = await mock.getMaindata(data.rid);
    applyMaindata(client, data);
    expect(client.categories.has('iso')).toBe(false);
    expect(client.tags.has('fresh')).toBe(false);
    expect(client.torrents.get(a)!.category).toBe('');
    expect(client.torrents.get(a)!.tags).not.toContain('fresh');
  });

  it('rejects an unknown category like qBittorrent (409)', async () => {
    const mock = new MockProvider(1);
    await expect(mock.setCategory([], 'nope')).rejects.toMatchObject({ status: 409 });
  });
});

describe('MockProvider client data', () => {
  it('returns only stored keys, and null deletes a key', async () => {
    const mock = new MockProvider(1);
    await mock.storeClientData({ a: 1, b: 2 });
    await expect(mock.loadClientData(['a', 'b', 'c'])).resolves.toEqual({ a: 1, b: 2 });
    await mock.storeClientData({ a: null });
    await expect(mock.loadClientData(['a', 'b'])).resolves.toEqual({ b: 2 });
  });

  it('stores and returns copies', async () => {
    const mock = new MockProvider(1);
    const value = { list: ['x'] };
    await mock.storeClientData({ k: value });
    value.list.push('y');
    const loaded = (await mock.loadClientData(['k']))['k'] as typeof value;
    expect(loaded.list).toEqual(['x']);
    loaded.list.push('z');
    await expect(mock.loadClientData(['k'])).resolves.toEqual({ k: { list: ['x'] } });
  });
});

describe('MockProvider network interfaces', () => {
  it('lists interfaces by name and value only', async () => {
    const interfaces = await new MockProvider(1).getNetworkInterfaces();
    expect(interfaces.length).toBeGreaterThan(1);
    for (const entry of interfaces) expect(Object.keys(entry).sort()).toEqual(['name', 'value']);
  });

  it('returns the addresses of one interface, or all of them for an empty iface', async () => {
    const mock = new MockProvider(1);
    const [first, second] = await mock.getNetworkInterfaces();
    const firstAddresses = await mock.getNetworkInterfaceAddresses(first!.value);
    const secondAddresses = await mock.getNetworkInterfaceAddresses(second!.value);
    expect(firstAddresses.length).toBeGreaterThan(0);
    expect(firstAddresses.filter((ip) => secondAddresses.includes(ip))).toEqual([]);
    await expect(mock.getNetworkInterfaceAddresses('')).resolves.toEqual(
      expect.arrayContaining([...firstAddresses, ...secondAddresses]),
    );
    await expect(mock.getNetworkInterfaceAddresses('nope0')).resolves.toEqual([]);
  });
});

describe('MockProvider directories', () => {
  it('lists the full paths of the subdirectories', async () => {
    const mock = new MockProvider(1);
    await expect(mock.getDirectoryContent('/media')).resolves.toEqual(['/media/library']);
    const root = await mock.getDirectoryContent('/');
    expect(root).toContain('/downloads');
    expect(root.every((path) => path.startsWith('/') && !path.startsWith('//'))).toBe(true);
  });

  it('tolerates a trailing slash', async () => {
    const mock = new MockProvider(1);
    await expect(mock.getDirectoryContent('/downloads/')).resolves.toEqual(
      await mock.getDirectoryContent('/downloads'),
    );
  });

  it('lets every listed directory be listed in turn', async () => {
    const mock = new MockProvider(1);
    for (const path of await mock.getDirectoryContent('/downloads')) {
      await expect(mock.getDirectoryContent(path)).resolves.toBeInstanceOf(Array);
    }
  });

  it('answers 400 for a relative path and 404 for a missing one', async () => {
    const mock = new MockProvider(1);
    await expect(mock.getDirectoryContent('downloads')).rejects.toMatchObject({ status: 400 });
    await expect(mock.getDirectoryContent('/nope')).rejects.toMatchObject({ status: 404 });
  });

  it('reports the free disk space of the server', async () => {
    const mock = new MockProvider(1);
    const data = await mock.getMaindata(0);
    await expect((mock as IProvider).getFreeSpaceAtPath('/downloads')).resolves.toBe(
      data.server_state!.free_space_on_disk,
    );
  });
});
