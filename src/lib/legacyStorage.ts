export const LEGACY_STORAGE_PREFIX = 'qbt-ui:';
export const STORAGE_PREFIX = 'slake:';

export function migrateLegacyStorage() {
  const legacyKeys = Object.keys(localStorage).filter((key) =>
    key.startsWith(LEGACY_STORAGE_PREFIX),
  );
  for (const legacyKey of legacyKeys) {
    const key = STORAGE_PREFIX + legacyKey.slice(LEGACY_STORAGE_PREFIX.length);
    if (localStorage.getItem(key) === null)
      localStorage.setItem(key, localStorage.getItem(legacyKey)!);
    localStorage.removeItem(legacyKey);
  }
}
