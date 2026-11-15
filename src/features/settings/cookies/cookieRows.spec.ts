import { describe, expect, it } from 'vitest';
import {
  cookieProblems,
  cookiesToRows,
  emptyCookieRow,
  invalidFields,
  isExpired,
  localInputToUnixSeconds,
  rowsToCookies,
  sameCookies,
  unixSecondsToLocalInput,
  type CookieRow,
} from './cookieRows';

const row = (overrides: Partial<CookieRow> = {}): CookieRow => ({
  ...emptyCookieRow(),
  domain: 'example.com',
  name: 'sid',
  value: 'abc',
  ...overrides,
});

describe('emptyCookieRow', () => {
  it('gives each row a unique key', () => {
    expect(emptyCookieRow().key).not.toBe(emptyCookieRow().key);
  });
});

describe('local date inputs', () => {
  it('round-trips through unix seconds in the local time zone', () => {
    const seconds = Math.floor(new Date(2030, 0, 2, 3, 4).getTime() / 1000);
    expect(unixSecondsToLocalInput(seconds)).toBe('2030-01-02T03:04');
    expect(localInputToUnixSeconds('2030-01-02T03:04')).toBe(seconds);
  });

  it('treats a negative expiry (session cookie) as empty', () => {
    expect(unixSecondsToLocalInput(-1)).toBe('');
  });

  it('returns null for empty or invalid input', () => {
    expect(localInputToUnixSeconds('')).toBeNull();
    expect(localInputToUnixSeconds('nonsense')).toBeNull();
  });
});

describe('cookiesToRows', () => {
  it('maps raw cookies to rows with fresh keys', () => {
    const rows = cookiesToRows([
      { domain: 'a.com', path: '/x', name: 'n', value: 'v', expirationDate: -1 },
      { domain: 'b.com', path: '/', name: 'm', value: 'w', expirationDate: 1893456000 },
    ]);
    expect(rows[0]).toMatchObject({
      domain: 'a.com',
      path: '/x',
      name: 'n',
      value: 'v',
      expires: '',
    });
    expect(rows[1]!.expires).toBe(unixSecondsToLocalInput(1893456000));
    expect(rows[0]!.key).not.toBe(rows[1]!.key);
  });
});

describe('rowsToCookies', () => {
  it('skips blank rows, trims fields and defaults the path to /', () => {
    expect(
      rowsToCookies([
        emptyCookieRow(),
        row({ domain: ' example.com ', name: ' sid ', value: ' keep spaces ', path: ' ' }),
      ]),
    ).toEqual([{ domain: 'example.com', path: '/', name: 'sid', value: ' keep spaces ' }]);
  });

  it('adds an expirationDate only when one is set', () => {
    const [session, persistent] = rowsToCookies([row(), row({ expires: '2030-01-02T03:04' })]);
    expect(session).not.toHaveProperty('expirationDate');
    expect(persistent!.expirationDate).toBe(localInputToUnixSeconds('2030-01-02T03:04'));
  });

  it('round-trips with cookiesToRows', () => {
    const cookies = [
      { domain: 'a.com', path: '/p', name: 'n', value: 'v', expirationDate: 1893456000 },
    ];
    expect(rowsToCookies(cookiesToRows(cookies))).toEqual(cookies);
  });
});

describe('sameCookies', () => {
  it('compares by content', () => {
    const a = { domain: 'a', path: '/', name: 'n', value: 'v' };
    expect(sameCookies([a], [{ ...a }])).toBe(true);
    expect(sameCookies([a], [{ ...a, value: 'w' }])).toBe(false);
    expect(sameCookies([a], [])).toBe(false);
  });
});

describe('isExpired', () => {
  const now = new Date(2030, 0, 1, 12, 0).getTime();

  it('is true at or before now and false after', () => {
    expect(isExpired(row({ expires: '2030-01-01T12:00' }), now)).toBe(true);
    expect(isExpired(row({ expires: '2029-12-31T00:00' }), now)).toBe(true);
    expect(isExpired(row({ expires: '2030-01-01T12:01' }), now)).toBe(false);
  });

  it('never expires a session cookie', () => {
    expect(isExpired(row({ expires: '' }), now)).toBe(false);
  });
});

describe('invalidFields', () => {
  it('accepts a valid row and ignores blank rows', () => {
    expect(invalidFields(row()).size).toBe(0);
    expect(invalidFields(emptyCookieRow()).size).toBe(0);
  });

  it('flags a missing domain or name', () => {
    expect([...invalidFields(row({ domain: ' ', name: '' }))].sort()).toEqual(['domain', 'name']);
  });

  it('flags a domain with a scheme path or whitespace', () => {
    expect(invalidFields(row({ domain: 'https://example.com' })).has('domain')).toBe(true);
    expect(invalidFields(row({ domain: 'a b.com' })).has('domain')).toBe(true);
  });

  it('flags names with reserved characters', () => {
    for (const name of ['a b', 'a=b', 'a;b', 'a,b'])
      expect(invalidFields(row({ name })).has('name')).toBe(true);
  });

  it('flags non-ASCII anywhere and semicolons in the value', () => {
    expect(invalidFields(row({ domain: 'exämple.com' })).has('domain')).toBe(true);
    expect(invalidFields(row({ name: 'sïd' })).has('name')).toBe(true);
    expect(invalidFields(row({ value: 'é' })).has('value')).toBe(true);
    expect(invalidFields(row({ value: 'a;b' })).has('value')).toBe(true);
  });
});

describe('cookieProblems', () => {
  it('is empty for valid and blank rows', () => {
    expect(cookieProblems([row(), emptyCookieRow()])).toEqual([]);
  });

  it('asks for a domain and name when either is missing', () => {
    expect(cookieProblems([row({ name: '' })])).toEqual([
      'Every cookie needs a domain and a name.',
    ]);
  });

  it('reports malformed fields separately from missing ones', () => {
    const problems = cookieProblems([row({ domain: 'a/b' })]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/plain ASCII/);
  });

  it('reports duplicate cookies, matching the domain case-insensitively', () => {
    expect(cookieProblems([row(), row({ domain: 'EXAMPLE.com', path: '/' })])).toEqual([
      'Two cookies have the same domain, path and name.',
    ]);
  });

  it('allows the same name on different paths', () => {
    expect(cookieProblems([row({ path: '/a' }), row({ path: '/b' })])).toEqual([]);
  });
});
