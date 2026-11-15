import { SAVED_VIEWS_KEY } from '@/stores/savedViews';
import { STORAGE_PREFIX } from './legacyStorage';

const FILE_FORMAT = 'slake-settings';
const LEGACY_FILE_FORMAT = 'qbt-ui-settings';
const FILE_VERSION = 1;

const NOT_PORTABLE_KEYS = new Set([
  'filters.v2',
  'searchJobDetails',
  'customThemeSeen',
  SAVED_VIEWS_KEY.slice(STORAGE_PREFIX.length),
]);

interface UiSettingsFile {
  format: typeof FILE_FORMAT;
  version: number;
  exportedAt: string;
  settings: Record<string, string>;
}

export class InvalidUiSettingsFile extends Error {}

function portableStorageKeys(): string[] {
  return Object.keys(localStorage).filter(
    (key) =>
      key.startsWith(STORAGE_PREFIX) && !NOT_PORTABLE_KEYS.has(key.slice(STORAGE_PREFIX.length)),
  );
}

export function exportUiSettings(): string {
  const settings: Record<string, string> = {};
  for (const key of portableStorageKeys().sort())
    settings[key.slice(STORAGE_PREFIX.length)] = localStorage.getItem(key) ?? '';
  const file: UiSettingsFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
  };
  return JSON.stringify(file, null, 2);
}

function parseSettings(text: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidUiSettingsFile("The file isn't JSON.");
  }
  const file = parsed as Partial<UiSettingsFile> | null;
  const isKnownFormat = file?.format === FILE_FORMAT || file?.format === LEGACY_FILE_FORMAT;
  if (!isKnownFormat || typeof file.settings !== 'object' || !file.settings)
    throw new InvalidUiSettingsFile("The file isn't a Slake settings export.");
  if (typeof file.version !== 'number' || file.version > FILE_VERSION)
    throw new InvalidUiSettingsFile('The file is from a newer version of this UI.');
  return Object.fromEntries(
    Object.entries(file.settings).filter(
      ([key, value]) => typeof value === 'string' && !NOT_PORTABLE_KEYS.has(key),
    ),
  );
}

export function importUiSettings(text: string) {
  const settings = parseSettings(text);
  for (const key of portableStorageKeys()) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(settings))
    localStorage.setItem(STORAGE_PREFIX + key, value);
}
