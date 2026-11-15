import type { RawTorrentFile } from '@/types/qbit';
import { buildFileTree, compileRegex, flattenTree, renamedPath, type FileNode } from './fileTree';

export type RenamePart = 'name' | 'basename' | 'extension';

export interface RenameRule {
  search: string;
  replacement: string;
  useRegex: boolean;
  caseSensitive: boolean;
  matchAll: boolean;
  part: RenamePart;
  includeFiles: boolean;
  includeFolders: boolean;
  counterStart: number;
}

export interface PlannedRename {
  kind: FileNode['kind'];
  oldPath: string;
  oldName: string;
  newPath: string;
  newName: string;
  problem?: string;
}

export type RenamePlan = { renames: PlannedRename[] } | { error: string };

export const DEFAULT_RENAME_RULE: RenameRule = {
  search: '',
  replacement: '',
  useRegex: false,
  caseSensitive: false,
  matchAll: false,
  part: 'name',
  includeFiles: true,
  includeFolders: false,
  counterStart: 1,
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function planRenames(
  allFiles: readonly RawTorrentFile[],
  scope: readonly RawTorrentFile[],
  rule: RenameRule,
): RenamePlan {
  if (!rule.search) return { renames: [] };
  const flags = (rule.matchAll ? 'g' : '') + (rule.caseSensitive ? '' : 'i');
  const pattern = compileRegex(rule.useRegex ? rule.search : escapeRegex(rule.search), flags);
  if (!pattern) return { error: 'Not a valid regular expression.' };

  const candidates = flattenTree(buildFileTree(scope), new Set())
    .map((row) => row.node)
    .filter((node) => (node.kind === 'file' ? rule.includeFiles : rule.includeFolders));

  const renames: PlannedRename[] = [];
  let counter = rule.counterStart;
  for (const node of candidates) {
    const [base, extension] = splitExtension(node.name);
    const subject =
      rule.part === 'name' ? node.name : rule.part === 'basename' ? base : (extension ?? '');
    if (rule.part === 'extension' && extension === undefined) continue;
    pattern.lastIndex = 0;
    if (!pattern.test(subject)) continue;
    const replaced = subject.replace(pattern, (...args: unknown[]) =>
      expandReplacement(rule.replacement, captureGroups(args), counter),
    );
    counter++;
    const newName =
      rule.part === 'name'
        ? replaced
        : rule.part === 'basename'
          ? joinExtension(replaced, extension)
          : joinExtension(base, replaced || undefined);
    if (newName === node.name) continue;
    renames.push({
      kind: node.kind,
      oldPath: node.path,
      oldName: node.name,
      newPath: renamedPath(node.path, newName),
      newName,
    });
  }
  markProblems(allFiles, renames);
  return { renames };
}

function splitExtension(name: string): [string, string | undefined] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, undefined];
}

const joinExtension = (base: string, extension: string | undefined) =>
  extension === undefined ? base : `${base}.${extension}`;

function captureGroups(replaceArgs: unknown[]): (string | undefined)[] {
  const offsetAt = replaceArgs.findIndex((arg) => typeof arg === 'number');
  return replaceArgs.slice(0, offsetAt) as (string | undefined)[];
}

export function expandReplacement(
  template: string,
  groups: readonly (string | undefined)[],
  counter: number,
): string {
  let out = '';
  for (let i = 0; i < template.length; i++) {
    const char = template[i]!;
    const next = template[i + 1];
    if (char === '\\' && next !== undefined) {
      out += next;
      i++;
    } else if (char === '$' && next !== undefined && next >= '0' && next <= '9') {
      out += groups[Number(next)] ?? '';
      i++;
    } else if (char === '$' && next === 'd') {
      let width = 0;
      while (template[i + 1 + width] === 'd') width++;
      out += String(counter).padStart(width, '0');
      i += width;
    } else {
      out += char;
    }
  }
  return out;
}

function markProblems(allFiles: readonly RawTorrentFile[], renames: PlannedRename[]) {
  const newNameByPath = new Map(renames.map((r) => [r.oldPath, r.newName]));
  const finalNamesByParent = new Map<string, Map<string, number>>();
  const countName = (path: string) => {
    const slash = path.lastIndexOf('/');
    const parent = slash === -1 ? '' : path.slice(0, slash);
    const name = newNameByPath.get(path) ?? path.slice(slash + 1);
    const siblings = finalNamesByParent.get(parent) ?? new Map<string, number>();
    finalNamesByParent.set(parent, siblings);
    siblings.set(name, (siblings.get(name) ?? 0) + 1);
  };
  const folders = new Set<string>();
  for (const file of allFiles) {
    countName(file.name);
    for (let slash = file.name.indexOf('/'); slash !== -1;) {
      folders.add(file.name.slice(0, slash));
      slash = file.name.indexOf('/', slash + 1);
    }
  }
  folders.forEach(countName);

  for (const rename of renames) {
    const parent = rename.oldPath.slice(0, Math.max(0, rename.oldPath.lastIndexOf('/')));
    if (!rename.newName.trim()) rename.problem = 'Name is empty';
    else if (rename.newName.includes('/')) rename.problem = 'Name contains "/"';
    else if ((finalNamesByParent.get(parent)?.get(rename.newName) ?? 0) > 1)
      rename.problem = 'Name already taken';
  }
}

// Files first, then folders deepest-first: every request must still use paths that exist.
export function orderForApplying(renames: readonly PlannedRename[]): PlannedRename[] {
  const depth = (path: string) => path.split('/').length;
  const files = renames.filter((r) => r.kind === 'file');
  const folders = renames
    .filter((r) => r.kind === 'folder')
    .sort((a, b) => depth(b.oldPath) - depth(a.oldPath));
  return [...files, ...folders];
}
