import { describe, expect, it } from 'vitest';
import {
  buildSavePathTree,
  buildSubcategoryTree,
  countByFilterValue,
  countTreeNodes,
  pruneTreeToMatches,
  someNodeInTree,
  type TreeNode,
} from './filterTree';

const tally = (count: number, size: number) => ({ count, size });

describe('buildSubcategoryTree', () => {
  it('nests subcategories and creates synthetic parents for missing ancestors', () => {
    const tree = buildSubcategoryTree(['tv/anime/old'], new Map([['tv/anime/old', 2]]));
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ filterValue: 'tv', label: 'tv' });
    expect(tree[0]!.children[0]).toMatchObject({ filterValue: 'tv/anime', label: 'anime' });
    expect(tree[0]!.children[0]!.children[0]).toMatchObject({
      filterValue: 'tv/anime/old',
      label: 'old',
      countIncludingDescendants: 2,
    });
  });

  it('adds descendant counts to every ancestor', () => {
    const tree = buildSubcategoryTree(
      ['tv', 'tv/anime', 'tv/shows'],
      new Map([
        ['tv', 1],
        ['tv/anime', 2],
        ['tv/shows', 4],
      ]),
    );
    expect(tree[0]!.countIncludingDescendants).toBe(7);
    expect(tree[0]!.children.map((c) => c.countIncludingDescendants)).toEqual([2, 4]);
  });

  it('counts a synthetic parent from its children only', () => {
    const tree = buildSubcategoryTree(['a/b'], new Map([['a/b', 3]]));
    expect(tree[0]!.countIncludingDescendants).toBe(3);
  });

  it('treats missing counts as zero', () => {
    const tree = buildSubcategoryTree(['solo'], new Map());
    expect(tree[0]!.countIncludingDescendants).toBe(0);
  });

  it('sorts siblings with numeric collation at every level', () => {
    const tree = buildSubcategoryTree(['s10', 's2', 'show/e10', 'show/e2', 'Alpha'], new Map());
    expect(tree.map((n) => n.label)).toEqual(['Alpha', 's2', 's10', 'show']);
    expect(tree[3]!.children.map((n) => n.label)).toEqual(['e2', 'e10']);
  });

  it('ignores empty segments', () => {
    const tree = buildSubcategoryTree(['/a//b'], new Map());
    expect(tree[0]).toMatchObject({ filterValue: 'a' });
    expect(tree[0]!.children[0]).toMatchObject({ filterValue: 'a/b' });
  });
});

describe('buildSavePathTree', () => {
  it('folds a single-child chain into one labelled node', () => {
    const tree = buildSavePathTree(new Map([['/data/torrents', tally(2, 100)]]));
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      filterValue: '/data/torrents',
      label: '/data/torrents',
      countIncludingDescendants: 2,
      sizeIncludingDescendants: 100,
      children: [],
    });
  });

  it('keeps a shared parent with its diverging children', () => {
    const tree = buildSavePathTree(
      new Map([
        ['/data/movies', tally(1, 10)],
        ['/data/linux', tally(2, 20)],
      ]),
    );
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      filterValue: '/data',
      label: '/data',
      countIncludingDescendants: 3,
      sizeIncludingDescendants: 30,
    });
    expect(tree[0]!.children.map((c) => [c.filterValue, c.label])).toEqual([
      ['/data/linux', 'linux'],
      ['/data/movies', 'movies'],
    ]);
  });

  it('does not fold a folder that has torrents of its own', () => {
    const tree = buildSavePathTree(
      new Map([
        ['/data', tally(1, 5)],
        ['/data/deep/er', tally(2, 7)],
      ]),
    );
    expect(tree[0]).toMatchObject({
      filterValue: '/data',
      countIncludingDescendants: 3,
      sizeIncludingDescendants: 12,
    });
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]).toMatchObject({
      filterValue: '/data/deep/er',
      label: 'deep/er',
    });
  });

  it('folds Windows paths and keeps backslashes in labels and values', () => {
    const tree = buildSavePathTree(new Map([['C:\\Downloads\\x', tally(1, 1)]]));
    expect(tree[0]).toMatchObject({
      filterValue: 'C:\\Downloads\\x',
      label: 'C:\\Downloads\\x',
    });
  });

  it('renders a root-only path as its own node', () => {
    const tree = buildSavePathTree(new Map([['/', tally(4, 40)]]));
    expect(tree).toEqual([
      {
        filterValue: '/',
        label: '/',
        countIncludingDescendants: 4,
        sizeIncludingDescendants: 40,
        children: [],
      },
    ]);
  });

  it('returns no nodes when there are no save paths', () => {
    expect(buildSavePathTree(new Map())).toEqual([]);
  });
});

const node = (filterValue: string, count: number, children: TreeNode[] = []): TreeNode => ({
  filterValue,
  label: filterValue.split('/').at(-1)!,
  countIncludingDescendants: count,
  sizeIncludingDescendants: 0,
  children,
});

const sampleTree = () => [
  node('tv', 5, [node('tv/anime', 3, [node('tv/anime/old', 1)]), node('tv/shows', 2)]),
  node('linux', 4),
];

describe('countTreeNodes', () => {
  it('counts every node at every depth', () => {
    expect(countTreeNodes(sampleTree())).toBe(5);
  });

  it('is zero for an empty tree', () => {
    expect(countTreeNodes([])).toBe(0);
  });
});

describe('someNodeInTree', () => {
  it('matches the node itself', () => {
    const [tv] = sampleTree();
    expect(someNodeInTree(tv!, (n) => n.filterValue === 'tv')).toBe(true);
  });

  it('matches a deep descendant', () => {
    const [tv] = sampleTree();
    expect(someNodeInTree(tv!, (n) => n.filterValue === 'tv/anime/old')).toBe(true);
  });

  it('does not match nodes outside the subtree', () => {
    const [tv] = sampleTree();
    expect(someNodeInTree(tv!, (n) => n.filterValue === 'linux')).toBe(false);
  });
});

describe('countByFilterValue', () => {
  it('maps every node, nested ones included, to its count with descendants', () => {
    expect(countByFilterValue(sampleTree())).toEqual(
      new Map([
        ['tv', 5],
        ['tv/anime', 3],
        ['tv/anime/old', 1],
        ['tv/shows', 2],
        ['linux', 4],
      ]),
    );
  });
});

describe('pruneTreeToMatches', () => {
  it('keeps a matching node and its ancestors, dropping non-matching siblings', () => {
    const pruned = pruneTreeToMatches(sampleTree(), (n) => n.label === 'old');
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.filterValue).toBe('tv');
    expect(pruned[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime']);
    expect(pruned[0]!.children[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime/old']);
  });

  it('keeps a matching node with its whole subtree, matching or not', () => {
    const pruned = pruneTreeToMatches(sampleTree(), (n) => n.label === 'tv');
    expect(pruned.map((n) => n.filterValue)).toEqual(['tv']);
    expect(countTreeNodes(pruned)).toBe(4);
    expect(pruned[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime', 'tv/shows']);
    expect(pruned[0]!.children[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime/old']);
  });

  it('does not evaluate descendants of a matching node', () => {
    const visited: string[] = [];
    pruneTreeToMatches(sampleTree(), (n) => {
      visited.push(n.filterValue);
      return n.label === 'tv';
    });
    expect(visited).toEqual(['tv', 'linux']);
  });

  it('prunes a non-matching ancestor down to its matching branches only', () => {
    const pruned = pruneTreeToMatches(sampleTree(), (n) => n.label === 'anime');
    expect(pruned.map((n) => n.filterValue)).toEqual(['tv']);
    expect(pruned[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime']);
    expect(pruned[0]!.children[0]!.children.map((c) => c.filterValue)).toEqual(['tv/anime/old']);
  });

  it('keeps several matches across branches in order', () => {
    const pruned = pruneTreeToMatches(
      sampleTree(),
      (n) => n.label === 'shows' || n.label === 'linux',
    );
    expect(pruned.map((n) => n.filterValue)).toEqual(['tv', 'linux']);
    expect(pruned[0]!.children.map((c) => c.filterValue)).toEqual(['tv/shows']);
  });

  it('returns nothing when no node matches', () => {
    expect(pruneTreeToMatches(sampleTree(), () => false)).toEqual([]);
  });

  it('does not mutate the original tree', () => {
    const tree = sampleTree();
    pruneTreeToMatches(tree, (n) => n.label === 'old');
    expect(countTreeNodes(tree)).toBe(5);
  });

  it('keeps counts of retained nodes', () => {
    const pruned = pruneTreeToMatches(sampleTree(), (n) => n.label === 'old');
    expect(pruned[0]!.countIncludingDescendants).toBe(5);
  });
});
