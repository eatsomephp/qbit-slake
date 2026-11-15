import type { PathTally } from './torrentFilters';

export interface TreeNode {
  filterValue: string;
  label: string;
  countIncludingDescendants: number;
  sizeIncludingDescendants: number;
  children: TreeNode[];
}

export function collate(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortTreeByLabel(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => collate(a.label, b.label));
  for (const node of nodes) sortTreeByLabel(node.children);
  return nodes;
}

function addDescendantTotals(nodes: TreeNode[]): void {
  for (const node of nodes) {
    addDescendantTotals(node.children);
    for (const child of node.children) {
      node.countIncludingDescendants += child.countIncludingDescendants;
      node.sizeIncludingDescendants += child.sizeIncludingDescendants;
    }
  }
}

function newNode(filterValue: string, label: string): TreeNode {
  return {
    filterValue,
    label,
    countIncludingDescendants: 0,
    sizeIncludingDescendants: 0,
    children: [],
  };
}

export function buildSubcategoryTree(
  categoryNames: readonly string[],
  torrentCountByCategory: ReadonlyMap<string, number>,
): TreeNode[] {
  const roots: TreeNode[] = [];
  const nodeByCategory = new Map<string, TreeNode>();
  for (const categoryName of categoryNames) {
    let siblings = roots;
    let pathSoFar = '';
    for (const segment of categoryName.split('/')) {
      if (!segment) continue;
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      let node = nodeByCategory.get(pathSoFar);
      if (!node) {
        node = newNode(pathSoFar, segment);
        nodeByCategory.set(pathSoFar, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
  }
  for (const [category, node] of nodeByCategory) {
    node.countIncludingDescendants = torrentCountByCategory.get(category) ?? 0;
  }
  addDescendantTotals(roots);
  return sortTreeByLabel(roots);
}

export function buildSavePathTree(tallyBySavePath: ReadonlyMap<string, PathTally>): TreeNode[] {
  const roots: TreeNode[] = [];
  const nodeByPathPrefix = new Map<string, TreeNode>();
  const foldersWithOwnTorrents = new Map<TreeNode, PathTally>();

  for (const [savePath, tally] of tallyBySavePath) {
    let siblings = roots;
    let deepestNode: TreeNode | undefined;
    for (const segment of savePath.matchAll(/[^\\/]+/g)) {
      // Prefixes are sliced from the path itself so isUnderPath matches them with either separator.
      const pathPrefix = savePath.slice(0, segment.index + segment[0].length);
      deepestNode = nodeByPathPrefix.get(pathPrefix);
      if (!deepestNode) {
        deepestNode = newNode(pathPrefix, siblings === roots ? pathPrefix : segment[0]);
        nodeByPathPrefix.set(pathPrefix, deepestNode);
        siblings.push(deepestNode);
      }
      siblings = deepestNode.children;
    }
    if (!deepestNode) {
      const rootOnlyPath = savePath;
      deepestNode = nodeByPathPrefix.get(rootOnlyPath);
      if (!deepestNode) {
        deepestNode = newNode(rootOnlyPath, rootOnlyPath);
        nodeByPathPrefix.set(rootOnlyPath, deepestNode);
        roots.push(deepestNode);
      }
    }
    foldersWithOwnTorrents.set(deepestNode, tally);
  }
  for (const [node, tally] of foldersWithOwnTorrents) {
    node.countIncludingDescendants = tally.count;
    node.sizeIncludingDescendants = tally.size;
  }
  addDescendantTotals(roots);
  return sortTreeByLabel(roots.map((root) => foldSingleChildChains(root, foldersWithOwnTorrents)));
}

function foldSingleChildChains(
  node: TreeNode,
  foldersWithOwnTorrents: ReadonlyMap<TreeNode, PathTally>,
): TreeNode {
  let current = node;
  let label = node.label;
  while (current.children.length === 1 && !foldersWithOwnTorrents.has(current)) {
    const onlyChild = current.children[0]!;
    label += onlyChild.filterValue.slice(current.filterValue.length);
    current = onlyChild;
  }
  return {
    ...current,
    label,
    children: current.children.map((child) => foldSingleChildChains(child, foldersWithOwnTorrents)),
  };
}

export function countTreeNodes(nodes: readonly TreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children), 0);
}

export function someNodeInTree(node: TreeNode, predicate: (node: TreeNode) => boolean): boolean {
  return predicate(node) || node.children.some((child) => someNodeInTree(child, predicate));
}

export function countByFilterValue(nodes: readonly TreeNode[]): Map<string, number> {
  const countByValue = new Map<string, number>();
  const visit = (node: TreeNode) => {
    countByValue.set(node.filterValue, node.countIncludingDescendants);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return countByValue;
}

export function pruneTreeToMatches(
  nodes: readonly TreeNode[],
  isMatch: (node: TreeNode) => boolean,
): TreeNode[] {
  return nodes.flatMap((node) => {
    if (isMatch(node)) return [node];
    const matchingChildren = pruneTreeToMatches(node.children, isMatch);
    return matchingChildren.length ? [{ ...node, children: matchingChildren }] : [];
  });
}
