const DRIVE_ROOT = /^[A-Za-z]:$/;

export function isAbsoluteHostPath(path: string): boolean {
  return /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
}

function withoutTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (trimmed === '') return path.startsWith('\\') ? '\\' : '/';
  if (DRIVE_ROOT.test(trimmed)) return `${trimmed}${path.charAt(2) || '\\'}`;
  return trimmed;
}

export function parentHostPath(path: string): string | null {
  const current = withoutTrailingSeparators(path);
  const separatorIndex = Math.max(current.lastIndexOf('/'), current.lastIndexOf('\\'));
  if (separatorIndex < 0 || separatorIndex === current.length - 1) return null;
  if (separatorIndex === 0) return current.charAt(0);
  const parent = current.slice(0, separatorIndex);
  if (DRIVE_ROOT.test(parent)) return `${parent}${current.charAt(separatorIndex)}`;
  return parent;
}

export function hostPathName(path: string): string {
  const current = withoutTrailingSeparators(path);
  const separatorIndex = Math.max(current.lastIndexOf('/'), current.lastIndexOf('\\'));
  return current.slice(separatorIndex + 1) || current;
}
