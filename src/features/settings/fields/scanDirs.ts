export type ScanDirTarget = 0 | 1 | string;
export type ScanDirs = Record<string, ScanDirTarget>;

export interface ScanDirRow {
  folder: string;
  target: 'watched' | 'default' | 'custom';
  customPath: string;
}

export function scanDirsToRows(dirs: ScanDirs): ScanDirRow[] {
  return Object.entries(dirs).map(([folder, target]) => {
    if (target === 0) return { folder, target: 'watched', customPath: '' };
    if (typeof target === 'string') return { folder, target: 'custom', customPath: target };
    return { folder, target: 'default', customPath: '' };
  });
}

export function scanDirsFromRows(rows: readonly ScanDirRow[]): ScanDirs {
  const dirs: ScanDirs = {};
  for (const row of rows) {
    const folder = row.folder.trim();
    if (!folder) continue;
    const customPath = row.customPath.trim();
    if (row.target === 'watched') dirs[folder] = 0;
    else if (row.target === 'custom' && customPath) dirs[folder] = customPath;
    else dirs[folder] = 1;
  }
  return dirs;
}
