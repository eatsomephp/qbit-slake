import { describe, expect, it } from 'vitest';
import { isValidWebSeedUrl, parseWebSeedList } from './webSeedUrls';

describe('isValidWebSeedUrl', () => {
  it.each(['http://a.example/f', 'https://a.example/', 'ftp://a.example/f'])('accepts %s', (url) =>
    expect(isValidWebSeedUrl(url)).toBe(true),
  );

  it.each([
    'magnet:?xt=urn:btih:abc',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'a.example/f',
    '',
  ])('rejects %s', (url) => expect(isValidWebSeedUrl(url)).toBe(false));
});

describe('parseWebSeedList', () => {
  it('takes one URL per line, trimmed and de-duplicated, reporting the invalid ones', () => {
    expect(
      parseWebSeedList(
        '  https://a.example/x \r\n\nhttps://a.example/x\nnot a url\nftp://b.example/y',
      ),
    ).toEqual({
      urls: ['https://a.example/x', 'ftp://b.example/y'],
      invalid: ['not a url'],
    });
  });
});
