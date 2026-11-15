import { describe, expect, it } from 'vitest';
import { planTrackerReplace } from './trackerReplace';

const urls = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('planTrackerReplace', () => {
  it('plans nothing for an empty find string', () => {
    const plan = planTrackerReplace(urls({ 'http://a/x': ['h1'] }), '', 'b');
    expect(plan.replacements).toEqual([]);
    expect(plan.operationsByHash.size).toBe(0);
  });

  it('edits each matching url for the torrents that have it', () => {
    const plan = planTrackerReplace(
      urls({ 'http://old.org/a': ['h1', 'h2'], 'http://keep.org/a': ['h1'] }),
      'old.org',
      'new.org',
    );
    expect(plan.replacements).toEqual([
      { url: 'http://old.org/a', newUrl: 'http://new.org/a', hashes: ['h1', 'h2'] },
    ]);
    expect(plan.operationsByHash.get('h1')).toEqual([
      { kind: 'edit', url: 'http://old.org/a', newUrl: 'http://new.org/a' },
    ]);
    expect(plan.operationsByHash.get('h2')).toHaveLength(1);
  });

  it('replaces every occurrence in a url', () => {
    const plan = planTrackerReplace(urls({ 'http://a.a/a': ['h'] }), 'a', 'b');
    expect(plan.replacements[0]!.newUrl).toBe('http://b.b/b');
  });

  it('skips results that are blank or unchanged', () => {
    expect(planTrackerReplace(urls({ x: ['h'] }), 'x', '  ').replacements).toEqual([]);
    expect(planTrackerReplace(urls({ 'a/x': ['h'] }), 'x', 'x').replacements).toEqual([]);
  });

  it('removes the old url instead of editing when the torrent already has the target', () => {
    const plan = planTrackerReplace(
      urls({ 'http://old/a': ['h1', 'h2'], 'http://new/a': ['h1'] }),
      'old',
      'new',
    );
    expect(plan.operationsByHash.get('h1')).toEqual([{ kind: 'remove', url: 'http://old/a' }]);
    expect(plan.operationsByHash.get('h2')).toEqual([
      { kind: 'edit', url: 'http://old/a', newUrl: 'http://new/a' },
    ]);
  });

  it('removes the second url when two of a torrent collapse to the same target', () => {
    const plan = planTrackerReplace(
      urls({ 'http://a1/x': ['h'], 'http://a2/x': ['h'] }),
      'a1',
      'a2',
    );
    expect(plan.operationsByHash.get('h')).toEqual([{ kind: 'remove', url: 'http://a1/x' }]);

    const both = planTrackerReplace(
      urls({ 'http://a1/x': ['h'], 'http://a2/x': ['h'] }),
      'http://a',
      'http://b',
    );
    expect(both.operationsByHash.get('h')).toEqual([
      { kind: 'edit', url: 'http://a1/x', newUrl: 'http://b1/x' },
      { kind: 'edit', url: 'http://a2/x', newUrl: 'http://b2/x' },
    ]);
  });
});
