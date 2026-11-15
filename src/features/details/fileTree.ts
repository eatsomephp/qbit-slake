import { FilePriority } from '@/constants/qbit';
import type { RawTorrentFile } from '@/types/qbit';

export const MIXED = -1;
export const NO_AVAILABILITY = -1;

export const PRIORITY_LABEL: Record<number, string> = {
  [MIXED]: 'Mixed',
  [FilePriority.DoNotDownload]: 'Do not download',
  [FilePriority.Normal]: 'Normal',
  [FilePriority.High]: 'High',
  [FilePriority.Maximum]: 'Maximum',
};

export const PRIORITY_CHOICES = [
  FilePriority.Maximum,
  FilePriority.High,
  FilePriority.Normal,
  FilePriority.DoNotDownload,
];

export type Selection = 'all' | 'none' | 'some';

export interface FileNode {
  kind: 'file' | 'folder';
  name: string;
  /** Full '/'-separated path inside the torrent. */
  path: string;
  size: number;
  /** 0..1, size-weighted for folders. */
  progress: number;
  /** A FilePriority, or MIXED for folders whose files differ. */
  priority: number;
  /** File indexes at or under this node, for torrents/filePrio. */
  indexes: number[];
  /** Indexes set to DoNotDownload, so re-checking a folder keeps existing priorities. */
  skippedIndexes: number[];
  selection: Selection;
  remaining: number;
  availability: number;
  children: FileNode[];
}

export interface FileRow {
  node: FileNode;
  depth: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Builds a folder tree from qBittorrent's flat file list. Returns the synthetic root. */
export function buildFileTree(files: readonly RawTorrentFile[]): FileNode {
  const root: FileNode = folder('', '');
  for (const file of files) {
    const parts = file.name.split('/');
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let next = parent.children.find((c) => c.kind === 'folder' && c.name === parts[i]);
      if (!next) {
        next = folder(parts[i]!, path);
        parent.children.push(next);
      }
      parent = next;
    }
    const isSkipped = file.priority === FilePriority.DoNotDownload;
    parent.children.push({
      kind: 'file',
      name: parts.at(-1)!,
      path: file.name,
      size: file.size,
      progress: file.progress,
      priority: file.priority,
      indexes: [file.index],
      skippedIndexes: isSkipped ? [file.index] : [],
      selection: isSkipped ? 'none' : 'all',
      remaining: isSkipped ? 0 : file.size * (1 - file.progress),
      availability: file.availability,
      children: [],
    });
  }
  aggregate(root);
  return root;
}

function folder(name: string, path: string): FileNode {
  return {
    kind: 'folder',
    name,
    path,
    size: 0,
    progress: 0,
    priority: 0,
    indexes: [],
    skippedIndexes: [],
    selection: 'none',
    remaining: 0,
    availability: NO_AVAILABILITY,
    children: [],
  };
}

function aggregate(node: FileNode): void {
  if (node.kind === 'file') return;
  node.children.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : collator.compare(a.name, b.name),
  );
  let size = 0;
  let done = 0;
  let availability = Infinity;
  const priorities = new Set<number>();
  for (const child of node.children) {
    aggregate(child);
    size += child.size;
    done += child.size * child.progress;
    node.remaining += child.remaining;
    node.indexes.push(...child.indexes);
    node.skippedIndexes.push(...child.skippedIndexes);
    priorities.add(child.priority);
    if (child.availability >= 0) availability = Math.min(availability, child.availability);
  }
  node.size = size;
  node.progress = size > 0 ? done / size : 0;
  node.priority = priorities.size === 1 ? [...priorities][0]! : MIXED;
  node.availability = Number.isFinite(availability) ? availability : NO_AVAILABILITY;
  node.selection =
    node.skippedIndexes.length === 0
      ? 'all'
      : node.skippedIndexes.length === node.indexes.length
        ? 'none'
        : 'some';
}

export function filterFiles(
  files: readonly RawTorrentFile[],
  query: string,
  useRegex = false,
): readonly RawTorrentFile[] {
  const needle = query.trim();
  if (!needle) return files;
  if (useRegex) {
    const pattern = compileRegex(needle, 'i');
    return pattern ? files.filter((file) => pattern.test(file.name)) : files;
  }
  const lowerNeedle = needle.toLowerCase();
  return files.filter((file) => file.name.toLowerCase().includes(lowerNeedle));
}

export function compileRegex(source: string, flags: string): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** Visible rows in display order; folders in `collapsed` hide their children. */
export function flattenTree(root: FileNode, collapsed: ReadonlySet<string>): FileRow[] {
  const rows: FileRow[] = [];
  const walk = (node: FileNode, depth: number) => {
    for (const child of node.children) {
      rows.push({ node: child, depth });
      if (child.kind === 'folder' && !collapsed.has(child.path)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Path with its last segment replaced, for renames. */
export function renamedPath(path: string, newName: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? newName : `${path.slice(0, i)}/${newName}`;
}
