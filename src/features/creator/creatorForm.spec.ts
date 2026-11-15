import { beforeEach, describe, expect, it } from 'vitest';
import {
  PIECE_SIZES,
  creatorProblems,
  initialCreatorForm,
  isLibtorrent2,
  pieceSizeLabel,
  rememberedPart,
  toNewTorrentOptions,
  trackerTiers,
  useRememberedCreatorOptions,
  webSeedList,
  type CreatorForm,
} from './creatorForm';

const form = (over: Partial<CreatorForm> = {}): CreatorForm => ({
  ...initialCreatorForm(rememberedPart(initialCreatorForm({} as never))),
  ...over,
});

beforeEach(() => localStorage.clear());

describe('trackerTiers', () => {
  it('keeps one blank line between tiers and trims', () => {
    expect(trackerTiers(' a \nb\n\n\n\nc\n')).toEqual(['a', 'b', '', 'c']);
  });

  it('drops leading and trailing blanks', () => {
    expect(trackerTiers('\n\na\n\n')).toEqual(['a']);
    expect(trackerTiers('  \n ')).toEqual([]);
  });
});

describe('webSeedList', () => {
  it('trims, drops blanks and duplicates', () => {
    expect(webSeedList(' http://a \n\nhttp://a\nhttp://b')).toEqual(['http://a', 'http://b']);
  });
});

describe('creatorProblems', () => {
  it('is empty for a valid form and for blank paths', () => {
    expect(creatorProblems(form())).toEqual({});
    expect(
      creatorProblems(form({ sourcePath: '/data/x', torrentFilePath: 'C:\\t\\x.torrent' })),
    ).toEqual({});
  });

  it('flags relative host paths', () => {
    expect(
      creatorProblems(form({ sourcePath: 'relative/x', torrentFilePath: 'x.torrent' })),
    ).toEqual({
      sourcePath: expect.stringContaining('full path'),
      torrentFilePath: expect.stringContaining('full path'),
    });
  });

  it('lists up to two invalid web seeds and counts the rest', () => {
    const one = creatorProblems(form({ webSeeds: 'http://ok\nbad' }));
    expect(one.webSeeds).toContain('Not valid: bad');
    expect(one.webSeeds).not.toContain('more');
    const many = creatorProblems(form({ webSeeds: 'a\nb\nc\nd' }));
    expect(many.webSeeds).toContain('Not valid: a, b and 2 more');
  });

  it('accepts empty or whole-number padding and rejects others', () => {
    for (const ok of ['', ' ', '0', '64'])
      expect(creatorProblems(form({ paddedFileSizeLimitKib: ok }))).toEqual({});
    for (const bad of ['-1', '1.5', 'abc'])
      expect(
        creatorProblems(form({ paddedFileSizeLimitKib: bad })).paddedFileSizeLimit,
      ).toBeDefined();
  });
});

describe('toNewTorrentOptions', () => {
  const filled = form({
    sourcePath: ' /src ',
    torrentFilePath: ' /out.torrent ',
    comment: ' hi ',
    source: ' s ',
    trackers: 'a\n\nb',
    webSeeds: 'http://w\nhttp://w',
    format: 'v2',
    optimizeAlignment: true,
    paddedFileSizeLimitKib: '64',
    ignoreDotfiles: false,
  });

  it('trims the common fields', () => {
    expect(toNewTorrentOptions(filled, { isLibtorrent2: null, canIgnoreDotfiles: false })).toEqual({
      sourcePath: '/src',
      torrentFilePath: '/out.torrent',
      pieceSize: 0,
      isPrivate: false,
      startSeeding: true,
      comment: 'hi',
      source: 's',
      trackers: ['a', '', 'b'],
      webSeeds: ['http://w'],
    });
  });

  it('sends the format only for libtorrent 2', () => {
    const o = toNewTorrentOptions(filled, { isLibtorrent2: true, canIgnoreDotfiles: false });
    expect(o.format).toBe('v2');
    expect(o).not.toHaveProperty('optimizeAlignment');
    expect(o).not.toHaveProperty('paddedFileSizeLimit');
  });

  it('sends alignment and padding in bytes for libtorrent 1.2', () => {
    const caps = { isLibtorrent2: false, canIgnoreDotfiles: false };
    const o = toNewTorrentOptions(filled, caps);
    expect(o).not.toHaveProperty('format');
    expect(o).toMatchObject({ optimizeAlignment: true, paddedFileSizeLimit: 64 * 1024 });
    expect(
      toNewTorrentOptions({ ...filled, paddedFileSizeLimitKib: '' }, caps).paddedFileSizeLimit,
    ).toBe(-1);
    expect(
      toNewTorrentOptions({ ...filled, optimizeAlignment: false }, caps).paddedFileSizeLimit,
    ).toBe(-1);
  });

  it('sends ignoreDotfiles only when supported', () => {
    expect(
      toNewTorrentOptions(filled, { isLibtorrent2: null, canIgnoreDotfiles: true }).ignoreDotfiles,
    ).toBe(false);
    expect(
      toNewTorrentOptions(filled, { isLibtorrent2: null, canIgnoreDotfiles: false }),
    ).not.toHaveProperty('ignoreDotfiles');
  });
});

describe('remembered options', () => {
  it('excludes paths and comment, and restores the rest', () => {
    const f = form({
      sourcePath: '/x',
      comment: 'c',
      isPrivate: true,
      trackers: 't',
      pieceSize: 16384,
    });
    const remembered = rememberedPart(f);
    expect(remembered).not.toHaveProperty('sourcePath');
    expect(remembered).not.toHaveProperty('torrentFilePath');
    expect(remembered).not.toHaveProperty('comment');
    const next = initialCreatorForm(remembered);
    expect(next).toMatchObject({ isPrivate: true, trackers: 't', pieceSize: 16384 });
    expect(next).toMatchObject({ sourcePath: '', torrentFilePath: '', comment: '' });
  });

  it('merges stored partial options with the defaults', () => {
    localStorage.setItem('slake:creatorOptions', JSON.stringify({ isPrivate: true }));
    const stored = useRememberedCreatorOptions();
    expect(stored.value).toMatchObject({ isPrivate: true, format: 'hybrid', startSeeding: true });
  });
});

describe('pieceSizeLabel / PIECE_SIZES', () => {
  it('labels automatic and binary sizes', () => {
    expect(pieceSizeLabel(0)).toBe('Automatic');
    expect(pieceSizeLabel(1024 * 1024)).toMatch(/^1(\.0+)? MiB$/);
  });

  it('strips trailing zero decimals', () => {
    expect(pieceSizeLabel(16384)).toBe('16 KiB');
  });

  it('starts with automatic and doubles from 16 KiB', () => {
    expect(PIECE_SIZES[0]).toBe(0);
    expect(PIECE_SIZES[1]).toBe(16384);
    expect(PIECE_SIZES[2]).toBe(32768);
    expect(PIECE_SIZES).toHaveLength(15);
  });
});

describe('isLibtorrent2', () => {
  it('reads the major version', () => {
    expect(isLibtorrent2('2.0.10.0')).toBe(true);
    expect(isLibtorrent2('1.2.19.0')).toBe(false);
    expect(isLibtorrent2(undefined)).toBeNull();
    expect(isLibtorrent2('')).toBeNull();
  });
});
