// Minimal fetch wrapper for qBittorrent's WebAPI. UI code must go through
// services/qbit (the provider), never import this directly.

const BASE = 'api/v2/';
const DEFAULT_TIMEOUT_MS = 10_000;

export const UNAUTHORIZED_EVENT = 'qbt:unauthorized';
export const NETWORK_ERROR_EVENT = 'qbt:network-error';

export class QbtHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`qBittorrent API responded with ${status}`);
    this.name = 'QbtHttpError';
  }
}

export function describeQbtError(err: unknown): string {
  if (!(err instanceof QbtHttpError)) return String(err);
  // qBittorrent often explains 400/409 in a plain-text body.
  if (typeof err.body === 'string' && err.body && err.body.length < 200) return err.body;
  return `qBittorrent responded with ${err.status}`;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Milliseconds; 0 disables the timeout. */
  timeout?: number;
}

export type Query = Record<string, string | number | boolean | undefined>;

function toParams(data: Query = {}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) params.append(key, String(value));
  }
  return params;
}

function combineSignals(opts: RequestOptions, defaultTimeout: number): AbortSignal | undefined {
  const timeout = opts.timeout ?? defaultTimeout;
  const signals = [opts.signal, timeout > 0 ? AbortSignal.timeout(timeout) : undefined].filter(
    (s): s is AbortSignal => s !== undefined,
  );
  if (signals.length <= 1) return signals[0];
  return AbortSignal.any(signals);
}

async function parseBody(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return res.text();
}

async function request<T>(
  path: string,
  init: RequestInit,
  opts: RequestOptions,
  defaultTimeout = DEFAULT_TIMEOUT_MS,
  readSuccessBody: (res: Response) => Promise<unknown> = parseBody,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      credentials: 'same-origin',
      signal: combineSignals(opts, defaultTimeout),
    });
  } catch (err) {
    if (err instanceof TypeError) window.dispatchEvent(new Event(NETWORK_ERROR_EVENT));
    throw err;
  }

  if (!res.ok) {
    if (res.status === 403) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new QbtHttpError(res.status, await parseBody(res));
  }
  return (await readSuccessBody(res)) as T;
}

export function get<T>(path: string, query?: Query, opts: RequestOptions = {}): Promise<T> {
  const qs = query ? toParams(query).toString() : '';
  return request<T>(qs ? `${path}?${qs}` : path, { method: 'GET' }, opts);
}

export function getBlob(path: string, query?: Query, opts: RequestOptions = {}): Promise<Blob> {
  const qs = query ? toParams(query).toString() : '';
  return request<Blob>(
    qs ? `${path}?${qs}` : path,
    { method: 'GET' },
    opts,
    DEFAULT_TIMEOUT_MS,
    (res) => res.blob(),
  );
}

export function head(path: string, query?: Query, opts: RequestOptions = {}): Promise<void> {
  const qs = query ? toParams(query).toString() : '';
  return request<void>(qs ? `${path}?${qs}` : path, { method: 'HEAD' }, opts);
}

export function apiUrl(path: string, query?: Query): string {
  const qs = query ? toParams(query).toString() : '';
  return BASE + (qs ? `${path}?${qs}` : path);
}

export function post<T>(path: string, form?: Query, opts: RequestOptions = {}): Promise<T> {
  return request<T>(path, { method: 'POST', body: toParams(form) }, opts);
}

/** For endpoints whose success status matters (202 Accepted vs 200 OK). */
export function postWithStatus<T>(
  path: string,
  form?: Query,
  opts: RequestOptions = {},
): Promise<{ status: number; body: T }> {
  return request(
    path,
    { method: 'POST', body: toParams(form) },
    opts,
    DEFAULT_TIMEOUT_MS,
    async (res) => ({
      status: res.status,
      body: await parseBody(res),
    }),
  );
}

/** Used by torrents/add with .torrent files; gets a longer default timeout. */
export function postMultipart<T>(
  path: string,
  form: FormData,
  opts: RequestOptions = {},
): Promise<T> {
  return request<T>(path, { method: 'POST', body: form }, opts, 60_000);
}
