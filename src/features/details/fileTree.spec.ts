import { describe, expect, it } from 'vitest';
import type { RawTorrentFile } from '@/types/qbit';
import {
  MIXED,
  NO_AVAILABILITY,
  buildFileTree,
  filterFiles,
  flattenTree,
  renamedPath,
} from './fileTree';

function file(
  index: number,
  name: string,
  size: number,
  progress = 0,
  priority = 1,
): RawTorrentFile {
  return { index, name, size, progress, priority, piece_range: [0, 0], availability: 1 };
}

const files = [
  file(0, 'Show/Show.mkv', 900, 1, 1),
  file(1, 'Show/Subs/en.srt', 50, 0, 0),
  file(2, 'Show/Subs/es.srt', 50, 0, 0),
  file(3, 'Show/a.nfo', 0, 1, 1),
];

describe('buildFileTree', () => {
  it('nests folders, sorts folders first, and aggregates size/progress/priority', () => {
    const root = buildFileTree(files);
    const show = root.children[0]!;
    expect(show).toMatchObject({
      kind: 'folder',
      name: 'Show',
      path: 'Show',
      size: 1000,
      priority: MIXED,
    });
    expect(show.progress).toBeCloseTo(0.9);
    expect(show.indexes.sort()).toEqual([0, 1, 2, 3]);
    expect(show.children.map((c) => c.name)).toEqual(['Subs', 'a.nfo', 'Show.mkv']);
    const subs = show.children[0]!;
    expect(subs).toMatchObject({ path: 'Show/Subs', size: 100, priority: 0, progress: 0 });
  });

  it('handles single-file torrents', () => {
    const root = buildFileTree([file(0, 'debian.iso', 10, 0.5)]);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ kind: 'file', path: 'debian.iso', progress: 0.5 });
  });

  it('sorts names naturally', () => {
    const root = buildFileTree([file(0, 'ep10.mkv', 1), file(1, 'ep2.mkv', 1)]);
    expect(root.children.map((c) => c.name)).toEqual(['ep2.mkv', 'ep10.mkv']);
  });
});

describe('flattenTree', () => {
  it('lists rows with depth and hides collapsed folders', () => {
    const root = buildFileTree(files);
    const all = flattenTree(root, new Set());
    expect(all.map((r) => `${r.depth}:${r.node.name}`)).toEqual([
      '0:Show',
      '1:Subs',
      '2:en.srt',
      '2:es.srt',
      '1:a.nfo',
      '1:Show.mkv',
    ]);
    const collapsed = flattenTree(root, new Set(['Show/Subs']));
    expect(collapsed.map((r) => r.node.name)).toEqual(['Show', 'Subs', 'a.nfo', 'Show.mkv']);
  });
});

describe('renamedPath', () => {
  it.each([
    ['a.txt', 'b.txt', 'b.txt'],
    ['dir/sub/a.txt', 'b.txt', 'dir/sub/b.txt'],
    ['dir/sub', 'other', 'dir/other'],
  ])('%s → %s = %s', (path, name, expected) => {
    expect(renamedPath(path, name)).toBe(expected);
  });
});

describe('download selection', () => {
  it('marks folders as all, none or some, and collects only the skipped indexes', () => {
    const show = buildFileTree(files).children[0]!;
    const subs = show.children[0]!;
    expect(subs).toMatchObject({ selection: 'none', skippedIndexes: [1, 2] });
    expect(show.selection).toBe('some');
    expect(show.skippedIndexes.sort()).toEqual([1, 2]);
    expect(show.children[2]).toMatchObject({ name: 'Show.mkv', selection: 'all' });
  });

  it('sums remaining bytes of wanted files only', () => {
    const root = buildFileTree([file(0, 'd/a', 100, 0.25, 1), file(1, 'd/b', 100, 0, 0)]);
    expect(root.children[0]!.remaining).toBe(75);
  });

  it('takes the lowest known availability for folders', () => {
    const root = buildFileTree([
      { ...file(0, 'd/a', 1), availability: 0.4 },
      { ...file(1, 'd/b', 1), availability: -1 },
      { ...file(2, 'd/c', 1), availability: 0.9 },
    ]);
    expect(root.children[0]!.availability).toBe(0.4);
    expect(
      buildFileTree([{ ...file(0, 'd/a', 1), availability: -1 }]).children[0]!.availability,
    ).toBe(NO_AVAILABILITY);
  });
});

describe('filterFiles', () => {
  it('matches the full path case-insensitively and keeps everything for a blank query', () => {
    expect(filterFiles(files, ' SUBS/ ').map((f) => f.index)).toEqual([1, 2]);
    expect(filterFiles(files, '  ')).toBe(files);
  });
});
