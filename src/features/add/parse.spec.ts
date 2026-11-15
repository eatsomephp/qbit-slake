import { describe, expect, it } from 'vitest';
import { isTorrentFile, linkLabel, parseLinks } from './parse';

const HASH = 'a'.repeat(40);

describe('parseLinks', () => {
  it('keeps magnets and URLs, converts bare hashes, skips blanks and comments', () => {
    const text = `magnet:?xt=urn:btih:${HASH}&dn=debian\n\n  https://example.org/a.torrent  \n# comment\n${'B'.repeat(32)}`;
    expect(parseLinks(text)).toEqual({
      links: [
        `magnet:?xt=urn:btih:${HASH}&dn=debian`,
        'https://example.org/a.torrent',
        `magnet:?xt=urn:btih:${'B'.repeat(32)}`,
      ],
      invalid: [],
    });
  });

  it('reports invalid lines and de-duplicates', () => {
    expect(parseLinks('ftp://x\nhttp://a\r\nhttp://a\nhello')).toEqual({
      links: ['http://a'],
      invalid: ['ftp://x', 'hello'],
    });
  });
});

describe('isTorrentFile', () => {
  it('accepts by extension or MIME type', () => {
    expect(isTorrentFile(new File([''], 'x.TORRENT'))).toBe(true);
    expect(isTorrentFile(new File([''], 'x', { type: 'application/x-bittorrent' }))).toBe(true);
    expect(isTorrentFile(new File([''], 'x.txt'))).toBe(false);
  });
});

describe('linkLabel', () => {
  it.each([
    [`magnet:?xt=urn:btih:${HASH}&dn=Debian%2012`, 'Debian 12'],
    [`magnet:?xt=urn:btih:${HASH}`, HASH],
    ['https://example.org/files/My%20File.torrent?x=1', 'My File.torrent'],
    ['https://example.org/', 'example.org'],
  ])('%s → %s', (link, label) => {
    expect(linkLabel(link)).toBe(label);
  });
});
