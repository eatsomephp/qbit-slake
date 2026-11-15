import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_ERROR_EVENT,
  QbtHttpError,
  UNAUTHORIZED_EVENT,
  get,
  post,
  postMultipart,
} from './http';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

function callInit(): RequestInit {
  return fetchMock.mock.calls[0]![1] as RequestInit;
}

/** fetch stub that never resolves and rejects with AbortError when the signal aborts. */
function hangingFetch(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(init.signal!.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });
}

function listen(type: string) {
  const handler = vi.fn();
  window.addEventListener(type, handler);
  return { handler, stop: () => window.removeEventListener(type, handler) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('request basics', () => {
  it('uses a relative api/v2 path and same-origin credentials', async () => {
    fetchMock.mockResolvedValue(textResponse('ok'));
    await get('app/version');
    expect(fetchMock.mock.calls[0]![0]).toBe('api/v2/app/version');
    expect(callInit().credentials).toBe('same-origin');
    expect(callInit().method).toBe('GET');
  });
});

describe('get', () => {
  it('builds the query string and skips undefined values', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await get('torrents/info', { filter: 'all', limit: 5, reverse: false, hashes: undefined });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'api/v2/torrents/info?filter=all&limit=5&reverse=false',
    );
  });

  it('omits the "?" when there are no defined params', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await get('torrents/info', { hashes: undefined });
    expect(fetchMock.mock.calls[0]![0]).toBe('api/v2/torrents/info');
  });
});

describe('post', () => {
  it('sends a URLSearchParams body without undefined values', async () => {
    fetchMock.mockResolvedValue(textResponse('Ok.'));
    await post('auth/login', { username: 'admin', password: 'p w', skip: undefined });
    const init = callInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).toString()).toBe('username=admin&password=p+w');
  });

  it('sends an empty URLSearchParams body when no form is given', async () => {
    fetchMock.mockResolvedValue(textResponse('Ok.'));
    await post('auth/logout');
    expect((callInit().body as URLSearchParams).toString()).toBe('');
  });
});

describe('postMultipart', () => {
  it('sends the FormData as-is', async () => {
    fetchMock.mockResolvedValue(textResponse('Ok.'));
    const form = new FormData();
    form.append('urls', 'magnet:?xt=urn:btih:abc');
    await postMultipart('torrents/add', form);
    expect(callInit().method).toBe('POST');
    expect(callInit().body).toBe(form);
  });
});

describe('response parsing', () => {
  it('parses JSON when content-type is application/json', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ a: 1 }));
    await expect(get('sync/maindata')).resolves.toEqual({ a: 1 });
  });

  it('parses JSON when content-type carries a charset', async () => {
    fetchMock.mockResolvedValue(
      new Response('[1,2]', { headers: { 'content-type': 'application/json; charset=UTF-8' } }),
    );
    await expect(get('x')).resolves.toEqual([1, 2]);
  });

  it('returns text otherwise', async () => {
    fetchMock.mockResolvedValue(textResponse('Ok.'));
    await expect(post('auth/login', {})).resolves.toBe('Ok.');
  });
});

describe('errors', () => {
  it('throws QbtHttpError with status and parsed JSON body on non-2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ reason: 'bad' }, 400));
    const err = await get('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QbtHttpError);
    expect((err as QbtHttpError).status).toBe(400);
    expect((err as QbtHttpError).body).toEqual({ reason: 'bad' });
  });

  it('keeps a text body on non-2xx', async () => {
    fetchMock.mockResolvedValue(textResponse('Fails.', 409));
    const err = (await get('x').catch((e: unknown) => e)) as QbtHttpError;
    expect(err.status).toBe(409);
    expect(err.body).toBe('Fails.');
  });

  it('dispatches exactly one unauthorized event on 403', async () => {
    fetchMock.mockResolvedValue(textResponse('Forbidden', 403));
    const { handler, stop } = listen(UNAUTHORIZED_EVENT);
    await expect(get('x')).rejects.toBeInstanceOf(QbtHttpError);
    stop();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 500])('does not dispatch unauthorized on %i', async (status) => {
    fetchMock.mockResolvedValue(textResponse('nope', status));
    const { handler, stop } = listen(UNAUTHORIZED_EVENT);
    await expect(get('x')).rejects.toBeInstanceOf(QbtHttpError);
    stop();
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches network-error and rethrows on a fetch TypeError', async () => {
    const failure = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(failure);
    const net = listen(NETWORK_ERROR_EVENT);
    await expect(get('x')).rejects.toBe(failure);
    net.stop();
    expect(net.handler).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch network-error for an AbortError', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    const net = listen(NETWORK_ERROR_EVENT);
    await expect(get('x')).rejects.toBe(abort);
    net.stop();
    expect(net.handler).not.toHaveBeenCalled();
  });
});

describe('abort and timeout', () => {
  it('aborts the request when the caller signal aborts', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const promise = get('x', undefined, { signal: controller.signal, timeout: 0 });
    const net = listen(NETWORK_ERROR_EVENT);
    controller.abort();
    await expect(promise).rejects.toBeDefined();
    net.stop();
    expect(callInit().signal!.aborted).toBe(true);
    expect(net.handler).not.toHaveBeenCalled();
  });

  it('aborts when the timeout elapses', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const net = listen(NETWORK_ERROR_EVENT);
    await expect(get('x', undefined, { timeout: 10 })).rejects.toBeDefined();
    net.stop();
    expect(callInit().signal!.aborted).toBe(true);
    expect(net.handler).not.toHaveBeenCalled();
  });

  it('timeout: 0 passes no signal when the caller gave none', async () => {
    fetchMock.mockResolvedValue(textResponse('ok'));
    await get('x', undefined, { timeout: 0 });
    expect(callInit().signal).toBeUndefined();
  });

  it('timeout: 0 passes only the caller signal through', async () => {
    fetchMock.mockResolvedValue(textResponse('ok'));
    const controller = new AbortController();
    await get('x', undefined, { timeout: 0, signal: controller.signal });
    expect(callInit().signal).toBe(controller.signal);
  });

  it('applies a default timeout signal when none is configured', async () => {
    fetchMock.mockResolvedValue(textResponse('ok'));
    await get('x');
    expect(callInit().signal).toBeInstanceOf(AbortSignal);
    expect(callInit().signal!.aborted).toBe(false);
  });
});
