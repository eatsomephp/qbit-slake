import { describe, expect, it } from 'vitest';
import { scanDirsFromRows, scanDirsToRows, type ScanDirs } from './scanDirs';

describe('scanDirsToRows', () => {
  it('maps 0 to the watched folder, 1 to the default path and a string to a custom path', () => {
    expect(scanDirsToRows({ '/a': 0, '/b': 1, '/c': '/save' })).toEqual([
      { folder: '/a', target: 'watched', customPath: '' },
      { folder: '/b', target: 'default', customPath: '' },
      { folder: '/c', target: 'custom', customPath: '/save' },
    ]);
  });

  it('is empty for no entries', () => {
    expect(scanDirsToRows({})).toEqual([]);
  });
});

describe('scanDirsFromRows', () => {
  it('maps each target back to its wire value', () => {
    expect(
      scanDirsFromRows([
        { folder: '/a', target: 'watched', customPath: '' },
        { folder: '/b', target: 'default', customPath: '' },
        { folder: '/c', target: 'custom', customPath: '/save' },
      ]),
    ).toEqual({ '/a': 0, '/b': 1, '/c': '/save' });
  });

  it('round-trips', () => {
    const dirs: ScanDirs = { '/a': 0, '/b': 1, '/c': '/save' };
    expect(scanDirsFromRows(scanDirsToRows(dirs))).toEqual(dirs);
  });

  it('drops rows with an empty or blank folder', () => {
    expect(
      scanDirsFromRows([
        { folder: '', target: 'watched', customPath: '' },
        { folder: '   ', target: 'default', customPath: '' },
      ]),
    ).toEqual({});
  });

  it('trims the folder and the custom path', () => {
    expect(scanDirsFromRows([{ folder: ' /a ', target: 'custom', customPath: ' /save ' }])).toEqual(
      { '/a': '/save' },
    );
  });

  it('falls back to the default path for a custom target with no path', () => {
    expect(
      scanDirsFromRows([
        { folder: '/a', target: 'custom', customPath: '' },
        { folder: '/b', target: 'custom', customPath: '  ' },
      ]),
    ).toEqual({ '/a': 1, '/b': 1 });
  });

  it('ignores a leftover custom path when the target is not custom', () => {
    expect(scanDirsFromRows([{ folder: '/a', target: 'watched', customPath: '/x' }])).toEqual({
      '/a': 0,
    });
  });
});
