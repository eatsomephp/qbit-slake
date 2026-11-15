import { describe, expect, it } from 'vitest';
import type { RawTorrentFile } from '@/types/qbit';
import {
  DEFAULT_RENAME_RULE,
  expandReplacement,
  orderForApplying,
  planRenames,
  type PlannedRename,
  type RenameRule,
} from './fileRenamer';

function file(index: number, name: string): RawTorrentFile {
  return { index, name, size: 1, progress: 0, priority: 1, piece_range: [0, 0], availability: 1 };
}

const rule = (overrides: Partial<RenameRule>): RenameRule => ({
  ...DEFAULT_RENAME_RULE,
  ...overrides,
});

function plan(files: RawTorrentFile[], overrides: Partial<RenameRule>, scope = files) {
  const result = planRenames(files, scope, rule(overrides));
  if ('error' in result) throw new Error(result.error);
  return result.renames;
}

describe('expandReplacement', () => {
  it('expands capture groups, missing groups to empty', () => {
    expect(expandReplacement('$2-$1-$3', ['whole', 'a', 'b'], 1)).toBe('b-a-');
  });

  it('pads the counter to the number of d characters', () => {
    expect(expandReplacement('E$ddd', [], 7)).toBe('E007');
    expect(expandReplacement('E$d', [], 12)).toBe('E12');
  });

  it('treats a backslash as an escape', () => {
    expect(expandReplacement('\\$1 \\\\', ['', 'x'], 1)).toBe('$1 \\');
  });

  it('keeps a trailing dollar sign or backslash literal', () => {
    expect(expandReplacement('a$', [], 1)).toBe('a$');
    expect(expandReplacement('a\\', [], 1)).toBe('a\\');
  });
});

describe('planRenames', () => {
  it('plans nothing without a search', () => {
    expect(plan([file(0, 'a.txt')], { search: '' })).toEqual([]);
  });

  it('reports an invalid regular expression', () => {
    expect(planRenames([], [], rule({ search: '(', useRegex: true }))).toEqual({
      error: 'Not a valid regular expression.',
    });
  });

  it('treats the search as literal text unless regex is on', () => {
    const files = [file(0, 'a.b.txt'), file(1, 'axb.txt')];
    expect(plan(files, { search: 'a.b', replacement: 'X' }).map((r) => r.newName)).toEqual([
      'X.txt',
    ]);
  });

  it('is case-insensitive by default and honours caseSensitive', () => {
    const files = [file(0, 'Movie.mkv')];
    expect(plan(files, { search: 'movie', replacement: 'Film' })).toHaveLength(1);
    expect(plan(files, { search: 'movie', replacement: 'Film', caseSensitive: true })).toEqual([]);
  });

  it('replaces only the first match unless matchAll', () => {
    const files = [file(0, 'a_b_c.txt')];
    expect(plan(files, { search: '_', replacement: ' ' })[0]!.newName).toBe('a b_c.txt');
    expect(plan(files, { search: '_', replacement: ' ', matchAll: true })[0]!.newName).toBe(
      'a b c.txt',
    );
  });

  it('uses capture groups in regex mode', () => {
    const files = [file(0, 'show.S01E02.mkv')];
    const [renamed] = plan(files, {
      search: 'S(\\d+)E(\\d+)',
      replacement: '$1x$2',
      useRegex: true,
    });
    expect(renamed!.newName).toBe('show.01x02.mkv');
  });

  it('numbers matches with the counter, only counting those that match', () => {
    const files = [file(0, 'a.txt'), file(1, 'skip.mkv'), file(2, 'b.txt'), file(3, 'c.txt')];
    const renames = plan(files, {
      search: '.*\\.txt',
      replacement: 'ep$dd.txt',
      useRegex: true,
      counterStart: 5,
    });
    expect(renames.map((r) => r.newName)).toEqual(['ep05.txt', 'ep06.txt', 'ep07.txt']);
  });

  it('limits the match to the base name and keeps the extension', () => {
    const [renamed] = plan([file(0, 'txt.txt')], {
      search: 'txt',
      replacement: 'doc',
      part: 'basename',
    });
    expect(renamed!.newName).toBe('doc.txt');
  });

  it('limits the match to the extension, skipping files without one', () => {
    const files = [file(0, 'a.TXT'), file(1, 'README'), file(2, '.hidden')];
    const renames = plan(files, { search: 'txt', replacement: 'md', part: 'extension' });
    expect(renames.map((r) => r.newName)).toEqual(['a.md']);
  });

  it('drops the extension when the replacement empties it', () => {
    const [renamed] = plan([file(0, 'a.tmp')], {
      search: 'tmp',
      replacement: '',
      part: 'extension',
    });
    expect(renamed!.newName).toBe('a');
  });

  it('skips files whose name would not change', () => {
    expect(plan([file(0, 'a.txt')], { search: 'a', replacement: 'a' })).toEqual([]);
  });

  it('keeps the folder in the new path and renames only the scope', () => {
    const files = [file(0, 'dir/a.txt'), file(1, 'dir/b.txt')];
    const renames = plan(files, { search: '.txt', replacement: '.md' }, [files[0]!]);
    expect(renames).toEqual([
      {
        kind: 'file',
        oldPath: 'dir/a.txt',
        oldName: 'a.txt',
        newPath: 'dir/a.md',
        newName: 'a.md',
      },
    ]);
  });

  it('honours includeFiles and includeFolders', () => {
    const files = [file(0, 'foo/foo.txt')];
    const onlyFolders = plan(files, {
      search: 'foo',
      replacement: 'bar',
      includeFiles: false,
      includeFolders: true,
    });
    expect(onlyFolders.map((r) => [r.kind, r.newPath])).toEqual([['folder', 'bar']]);
    const both = plan(files, { search: 'foo', replacement: 'bar', includeFolders: true });
    expect(both.map((r) => r.kind).sort()).toEqual(['file', 'folder']);
  });

  describe('problems', () => {
    it('flags an empty name', () => {
      const [renamed] = plan([file(0, 'a.txt')], { search: 'a.txt', replacement: ' ' });
      expect(renamed!.problem).toBe('Name is empty');
    });

    it('flags a name containing a slash', () => {
      const [renamed] = plan([file(0, 'a.txt')], { search: 'a', replacement: 'x/y' });
      expect(renamed!.problem).toBe('Name contains "/"');
    });

    it('flags two renames producing the same name in one folder', () => {
      const renames = plan([file(0, 'a1.txt'), file(1, 'a2.txt')], {
        search: '\\d',
        replacement: '',
        useRegex: true,
      });
      expect(renames.map((r) => r.problem)).toEqual(['Name already taken', 'Name already taken']);
    });

    it('flags a collision with an untouched sibling', () => {
      const files = [file(0, 'a.txt'), file(1, 'b.txt')];
      const renames = plan(files, { search: 'a', replacement: 'b' }, [files[0]!]);
      expect(renames[0]!.problem).toBe('Name already taken');
    });

    it('flags every rename in a group that ends on the same name', () => {
      const files = [file(0, 'a.txt'), file(1, 'b.txt')];
      const renames = plan(files, { search: '^(a|b)', replacement: 'x', useRegex: true }, files);
      expect(renames.every((r) => r.problem === 'Name already taken')).toBe(true);
    });

    it('allows the same name in different folders', () => {
      const files = [file(0, 'd1/a1.txt'), file(1, 'd2/a.txt')];
      const renames = plan(files, { search: '1', replacement: '' }, [files[0]!]);
      expect(renames[0]!.problem).toBeUndefined();
    });

    it('flags a folder rename that collides with a sibling folder', () => {
      const files = [file(0, 'a/x.txt'), file(1, 'b/y.txt')];
      const renames = plan(files, {
        search: 'a',
        replacement: 'b',
        includeFiles: false,
        includeFolders: true,
      });
      expect(renames[0]!.problem).toBe('Name already taken');
    });
  });
});

describe('orderForApplying', () => {
  const rename = (kind: 'file' | 'folder', oldPath: string): PlannedRename => ({
    kind,
    oldPath,
    oldName: oldPath,
    newPath: oldPath,
    newName: oldPath,
  });

  it('puts files first, then folders deepest-first', () => {
    const ordered = orderForApplying([
      rename('folder', 'a'),
      rename('file', 'a/f.txt'),
      rename('folder', 'a/b/c'),
      rename('folder', 'a/b'),
    ]);
    expect(ordered.map((r) => r.oldPath)).toEqual(['a/f.txt', 'a/b/c', 'a/b', 'a']);
  });
});
