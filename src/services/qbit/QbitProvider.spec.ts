import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QbtHttpError } from './http';
import { QbitProvider } from './QbitProvider';

const fetchMock = vi.fn();
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('QbitProvider.login', () => {
  const qbit = new QbitProvider();

  it('succeeds on "Ok."', async () => {
    fetchMock.mockResolvedValue(text('Ok.'));
    await expect(qbit.login('u', 'p')).resolves.toBe(true);
  });

  it('succeeds on an empty 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(qbit.login('u', 'p')).resolves.toBe(true);
  });

  it('fails on 200 "Fails." (qBittorrent 5.0)', async () => {
    fetchMock.mockResolvedValue(text('Fails.'));
    await expect(qbit.login('u', 'p')).resolves.toBe(false);
  });

  it('fails on 401 (qBittorrent 5.3)', async () => {
    fetchMock.mockResolvedValue(text('Unauthorized', 401));
    await expect(qbit.login('u', 'p')).resolves.toBe(false);
  });

  it('rethrows 403 (IP banned)', async () => {
    fetchMock.mockResolvedValue(text('Forbidden', 403));
    await expect(qbit.login('u', 'p')).rejects.toBeInstanceOf(QbtHttpError);
  });
});

describe('QbitProvider.getVersion', () => {
  it('strips a leading v', async () => {
    fetchMock.mockResolvedValue(text('v5.3.0\n'));
    await expect(new QbitProvider().getVersion()).resolves.toBe('5.3.0');
  });
});

describe('QbitProvider.addTorrents', () => {
  const base = {
    urls: [] as string[],
    files: [] as File[],
    savePath: '',
    category: '',
    tags: [] as string[],
    stopped: false,
    sequential: false,
    firstLastPiecePrio: false,
    skipChecking: false,
  };

  it('posts multipart with urls, files and options (stopped and paused both sent)', async () => {
    fetchMock.mockResolvedValue(text('Ok.'));
    const file = new File(['d8:announce'], 'a.torrent');
    const ok = await new QbitProvider().addTorrents({
      ...base,
      urls: ['magnet:?xt=1', 'https://x/y.torrent'],
      files: [file],
      savePath: '/dl',
      category: 'linux',
      tags: ['a', 'b'],
      stopped: true,
      skipChecking: true,
    });
    expect(ok).toEqual({ ok: true, failed: 0 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('api/v2/torrents/add');
    const form = init.body as FormData;
    expect(form.get('urls')).toBe('magnet:?xt=1\nhttps://x/y.torrent');
    expect((form.get('torrents') as File).name).toBe('a.torrent');
    expect(form.get('savepath')).toBe('/dl');
    expect(form.get('category')).toBe('linux');
    expect(form.get('tags')).toBe('a,b');
    expect(form.get('stopped')).toBe('true');
    expect(form.get('paused')).toBe('true');
    expect(form.get('skip_checking')).toBe('true');
    expect(form.get('sequentialDownload')).toBe('false');
  });

  it('omits empty optional fields', async () => {
    fetchMock.mockResolvedValue(text('Ok.'));
    await new QbitProvider().addTorrents({ ...base, urls: ['magnet:?xt=1'] });
    const form = fetchMock.mock.calls[0]![1].body as FormData;
    expect(form.has('savepath')).toBe(false);
    expect(form.has('category')).toBe(false);
    expect(form.has('tags')).toBe(false);
    expect(form.has('torrents')).toBe(false);
  });

  it.each([
    ['Fails. body', () => text('Fails.')],
    ['415 invalid file', () => text('', 415)],
  ])('reports nothing added on %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(new QbitProvider().addTorrents({ ...base, urls: ['x'] })).resolves.toEqual({
      ok: false,
      failed: 0,
    });
  });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('reads failure counts from WebAPI 2.14+ JSON (202 partial, 409 all failed)', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ success_count: 1, pending_count: 1, failure_count: 1 }, 202),
    );
    await expect(
      new QbitProvider().addTorrents({ ...base, urls: ['a', 'b', 'c'] }),
    ).resolves.toEqual({
      ok: true,
      failed: 1,
    });
    fetchMock.mockResolvedValueOnce(json({ success_count: 0, failure_count: 2 }, 409));
    await expect(new QbitProvider().addTorrents({ ...base, urls: ['a', 'b'] })).resolves.toEqual({
      ok: false,
      failed: 2,
    });
  });

  it('sends seedMode instead of skip_checking from WebAPI 2.16', async () => {
    const qbit = new QbitProvider();
    fetchMock.mockResolvedValueOnce(text('2.16.0'));
    await qbit.getWebApiVersion();
    fetchMock.mockResolvedValueOnce(text('Ok.'));
    await qbit.addTorrents({ ...base, urls: ['x'], skipChecking: true });
    const form = fetchMock.mock.calls[1]![1].body as FormData;
    expect(form.get('seedMode')).toBe('true');
    expect(form.has('skip_checking')).toBe(false);
  });
});

describe('QbitProvider.setShareLimits', () => {
  const limits = {
    ratioLimit: 2,
    seedingTimeLimit: -2,
    inactiveSeedingTimeLimit: -1,
    action: 'Remove',
    mode: 'MatchAll',
  } as const;

  async function sentFor(apiVersion: string) {
    const qbit = new QbitProvider();
    fetchMock.mockResolvedValueOnce(text(apiVersion));
    await qbit.getWebApiVersion();
    fetchMock.mockResolvedValueOnce(text(''));
    await qbit.setShareLimits(['a', 'b'], { ...limits } as never);
    return new URLSearchParams(fetchMock.mock.calls.at(-1)![1].body as URLSearchParams);
  }

  it('omits action and mode before WebAPI 2.12', async () => {
    const form = await sentFor('2.11.4');
    expect(Object.fromEntries(form)).toEqual({
      hashes: 'a|b',
      ratioLimit: '2',
      seedingTimeLimit: '-2',
      inactiveSeedingTimeLimit: '-1',
    });
  });

  it('adds shareLimitAction from 2.12 and shareLimitsMode from 2.15.3', async () => {
    expect(Object.fromEntries(await sentFor('2.12.0'))).toMatchObject({
      shareLimitAction: 'Remove',
    });
    expect((await sentFor('2.12.0')).has('shareLimitsMode')).toBe(false);
    expect(Object.fromEntries(await sentFor('2.15.3'))).toMatchObject({
      shareLimitAction: 'Remove',
      shareLimitsMode: 'MatchAll',
    });
  });
});

describe('QbitProvider client data', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('loads the requested keys as a JSON array in the query', async () => {
    fetchMock.mockResolvedValue(json({ a: [1], b: 'x' }));
    await expect(new QbitProvider().loadClientData(['a', 'b'])).resolves.toEqual({
      a: [1],
      b: 'x',
    });
    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url, 'http://localhost/');
    expect(parsed.pathname).toBe('/api/v2/clientdata/load');
    expect(JSON.parse(parsed.searchParams.get('keys')!)).toEqual(['a', 'b']);
  });

  it('answers an empty object when the body is not an object', async () => {
    fetchMock.mockResolvedValue(json(null));
    await expect(new QbitProvider().loadClientData(['a'])).resolves.toEqual({});
    fetchMock.mockResolvedValue(text('nope'));
    await expect(new QbitProvider().loadClientData(['a'])).resolves.toEqual({});
  });

  it('stores the data as a JSON form field, with null for a deletion', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await new QbitProvider().storeClientData({ a: [1], b: null });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('api/v2/clientdata/store');
    expect(init.method).toBe('POST');
    expect(JSON.parse((init.body as URLSearchParams).get('data')!)).toEqual({ a: [1], b: null });
  });
});

describe('QbitProvider network interfaces', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('lists the interfaces', async () => {
    fetchMock.mockResolvedValue(json([{ name: 'eth0', value: 'eth0' }]));
    await expect(new QbitProvider().getNetworkInterfaces()).resolves.toEqual([
      { name: 'eth0', value: 'eth0' },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe('api/v2/app/networkInterfaceList');
  });

  it('lists the addresses of one interface, passing it as the iface query', async () => {
    fetchMock.mockResolvedValue(json(['10.2.0.2']));
    await expect(new QbitProvider().getNetworkInterfaceAddresses('wg 0')).resolves.toEqual([
      '10.2.0.2',
    ]);
    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url, 'http://localhost/');
    expect(parsed.pathname).toBe('/api/v2/app/networkInterfaceAddressList');
    expect(parsed.searchParams.get('iface')).toBe('wg 0');
  });

  it('asks for the addresses of every interface with an empty iface', async () => {
    fetchMock.mockResolvedValue(json([]));
    await new QbitProvider().getNetworkInterfaceAddresses('');
    const parsed = new URL(fetchMock.mock.calls[0]![0], 'http://localhost/');
    expect(parsed.searchParams.get('iface')).toBe('');
  });

  it('lists the subdirectories of a path, asking for directories only', async () => {
    fetchMock.mockResolvedValue(json(['/downloads/tv', '/downloads/movies']));
    await expect(new QbitProvider().getDirectoryContent('/downloads')).resolves.toEqual([
      '/downloads/tv',
      '/downloads/movies',
    ]);
    const parsed = new URL(fetchMock.mock.calls[0]![0], 'http://localhost/');
    expect(parsed.pathname).toBe('/api/v2/app/getDirectoryContent');
    expect(parsed.searchParams.get('dirPath')).toBe('/downloads');
    expect(parsed.searchParams.get('mode')).toBe('dirs');
  });

  it('rejects with the HTTP error for a missing directory', async () => {
    fetchMock.mockResolvedValue(text('Not found', 404));
    await expect(new QbitProvider().getDirectoryContent('/nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('converts the plain-text free space to a number', async () => {
    fetchMock.mockResolvedValue(text('123456789012'));
    await expect(new QbitProvider().getFreeSpaceAtPath('C:\\Data dir')).resolves.toBe(123456789012);
    const parsed = new URL(fetchMock.mock.calls[0]![0], 'http://localhost/');
    expect(parsed.pathname).toBe('/api/v2/app/getFreeSpaceAtPath');
    expect(parsed.searchParams.get('path')).toBe('C:\\Data dir');
  });
});
