import type { NewCookie, RawCookie } from '@/types/qbit';

export interface CookieRow {
  key: number;
  domain: string;
  path: string;
  name: string;
  value: string;
  /** A `datetime-local` value in the browser's time zone; empty for a session cookie. */
  expires: string;
}

export type CookieField = 'domain' | 'name' | 'value';

let nextRowKey = 0;

export function emptyCookieRow(): CookieRow {
  return { key: nextRowKey++, domain: '', path: '', name: '', value: '', expires: '' };
}

function pad(part: number): string {
  return String(part).padStart(2, '0');
}

export function unixSecondsToLocalInput(seconds: number): string {
  if (seconds < 0) return '';
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToUnixSeconds(input: string): number | null {
  if (!input) return null;
  const milliseconds = new Date(input).getTime();
  return Number.isNaN(milliseconds) ? null : Math.floor(milliseconds / 1000);
}

export function cookiesToRows(cookies: readonly RawCookie[]): CookieRow[] {
  return cookies.map((cookie) => ({
    key: nextRowKey++,
    domain: cookie.domain,
    path: cookie.path,
    name: cookie.name,
    value: cookie.value,
    expires: unixSecondsToLocalInput(cookie.expirationDate),
  }));
}

function isBlank(row: CookieRow): boolean {
  return !row.domain.trim() && !row.path.trim() && !row.name.trim() && !row.value && !row.expires;
}

export function rowsToCookies(rows: readonly CookieRow[]): NewCookie[] {
  return rows
    .filter((row) => !isBlank(row))
    .map((row) => {
      const cookie: NewCookie = {
        domain: row.domain.trim(),
        path: row.path.trim() || '/',
        name: row.name.trim(),
        value: row.value,
      };
      const expirationDate = localInputToUnixSeconds(row.expires);
      if (expirationDate !== null) cookie.expirationDate = expirationDate;
      return cookie;
    });
}

export function sameCookies(a: readonly NewCookie[], b: readonly NewCookie[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isExpired(row: CookieRow, nowMs = Date.now()): boolean {
  const expirationDate = localInputToUnixSeconds(row.expires);
  return expirationDate !== null && expirationDate * 1000 <= nowMs;
}

const NON_ASCII = /[^\x20-\x7e]/;
const INVALID_DOMAIN = /[\s/]/;
const INVALID_NAME = /[\s=;,]/;

export function invalidFields(row: CookieRow): Set<CookieField> {
  const invalid = new Set<CookieField>();
  if (isBlank(row)) return invalid;
  const domain = row.domain.trim();
  const name = row.name.trim();
  if (!domain || INVALID_DOMAIN.test(domain) || NON_ASCII.test(domain)) invalid.add('domain');
  if (!name || INVALID_NAME.test(name) || NON_ASCII.test(name)) invalid.add('name');
  if (row.value.includes(';') || NON_ASCII.test(row.value)) invalid.add('value');
  return invalid;
}

function identity(cookie: NewCookie): string {
  return `${cookie.domain.toLowerCase()}\n${cookie.path}\n${cookie.name}`;
}

export function cookieProblems(rows: readonly CookieRow[]): string[] {
  const problems: string[] = [];
  const invalid = rows.map(invalidFields);
  if (rows.some((row) => !isBlank(row) && (!row.domain.trim() || !row.name.trim())))
    problems.push('Every cookie needs a domain and a name.');
  const hasMalformed = rows.some(
    (row, index) =>
      (row.domain.trim() && invalid[index]!.has('domain')) ||
      (row.name.trim() && invalid[index]!.has('name')) ||
      invalid[index]!.has('value'),
  );
  if (hasMalformed)
    problems.push(
      'Cookies take plain ASCII only: a host name like example.com for the domain (no scheme or path), a name without spaces, =, ; or , and a value without ;.',
    );
  const identities = rowsToCookies(rows).map(identity);
  if (new Set(identities).size !== identities.length)
    problems.push('Two cookies have the same domain, path and name.');
  return problems;
}
