import { beforeEach, describe, expect, it } from 'vitest';
import { LIMIT_GLOBAL, ShareLimitAction, ShareLimitsMode } from '@/constants/qbit';
import {
  addFiles,
  addRequest,
  appendAddText,
  defaultAddLimits,
  fileKey,
  kibToBytes,
  openAdd,
  removeAddLines,
  resetAdd,
  shareLimitsChanged,
} from './addState';

const torrentFile = (name: string, size = 3) => new File(['x'.repeat(size)], name);

beforeEach(() => {
  resetAdd();
  addRequest.open = false;
});

describe('openAdd', () => {
  it('opens empty with no arguments', () => {
    openAdd();
    expect(addRequest).toMatchObject({ open: true, text: '', files: [], downloaders: {} });
  });

  it('appends to what the dialog already holds', () => {
    openAdd({ text: 'magnet:?a', files: [torrentFile('a.torrent')], downloaders: { x: 'p1' } });
    openAdd({ text: 'magnet:?b', files: [torrentFile('b.torrent')], downloaders: { y: 'p2' } });
    expect(addRequest.text).toBe('magnet:?a\nmagnet:?b');
    expect(addRequest.files.map((f) => f.name)).toEqual(['a.torrent', 'b.torrent']);
    expect(addRequest.downloaders).toEqual({ x: 'p1', y: 'p2' });
  });
});

describe('appendAddText', () => {
  it('joins on a single newline, trimming trailing whitespace of the existing text', () => {
    appendAddText('one\n\n');
    appendAddText('two');
    expect(addRequest.text).toBe('one\ntwo');
  });
});

describe('addFiles', () => {
  it('skips files already queued by name and size, but keeps same-name different-size', () => {
    addFiles([torrentFile('a.torrent', 3)]);
    addFiles([torrentFile('a.torrent', 3), torrentFile('a.torrent', 5)]);
    expect(addRequest.files.map(fileKey)).toEqual(['a.torrent:3', 'a.torrent:5']);
  });
});

describe('removeAddLines', () => {
  it('removes lines matching the predicate against the trimmed line', () => {
    addRequest.text = 'keep\r\n  drop  \nkeep2';
    removeAddLines((line) => line === 'drop');
    expect(addRequest.text).toBe('keep\nkeep2');
  });
});

describe('resetAdd', () => {
  it('clears text, files and downloaders without closing', () => {
    openAdd({ text: 'x', files: [torrentFile('a.torrent')], downloaders: { x: 'p' } });
    resetAdd();
    expect(addRequest).toMatchObject({ open: true, text: '', files: [], downloaders: {} });
  });
});

describe('kibToBytes', () => {
  it('converts KiB to bytes, rounding', () => {
    expect(kibToBytes('1')).toBe(1024);
    expect(kibToBytes('0.5')).toBe(512);
    expect(kibToBytes('0.0001')).toBe(0);
  });

  it('returns 0 for blank, negative, zero or non-numeric input', () => {
    for (const input of ['', '0', '-5', 'abc', 'Infinity']) expect(kibToBytes(input)).toBe(0);
  });
});

describe('shareLimitsChanged', () => {
  it('is false for the defaults and true when any field differs', () => {
    expect(shareLimitsChanged(defaultAddLimits().share)).toBe(false);
    const share = defaultAddLimits().share;
    expect(shareLimitsChanged({ ...share, ratioLimit: 2 })).toBe(true);
    expect(shareLimitsChanged({ ...share, seedingTimeLimit: 10 })).toBe(true);
    expect(shareLimitsChanged({ ...share, inactiveSeedingTimeLimit: 10 })).toBe(true);
    expect(shareLimitsChanged({ ...share, action: ShareLimitAction.Remove })).toBe(true);
    expect(shareLimitsChanged({ ...share, mode: ShareLimitsMode.MatchAny })).toBe(true);
  });
});

describe('defaultAddLimits', () => {
  it('uses the global limit and returns fresh objects', () => {
    const limits = defaultAddLimits();
    expect(limits).toMatchObject({ downloadKiB: '', uploadKiB: '' });
    expect(limits.share.ratioLimit).toBe(LIMIT_GLOBAL);
    expect(defaultAddLimits().share).not.toBe(limits.share);
  });
});
