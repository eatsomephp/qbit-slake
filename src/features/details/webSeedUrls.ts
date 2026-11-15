const WEB_SEED_PROTOCOLS = new Set(['http:', 'https:', 'ftp:']);

export function isValidWebSeedUrl(url: string): boolean {
  try {
    return WEB_SEED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** One URL per line; duplicates are dropped. */
export function parseWebSeedList(text: string): { urls: string[]; invalid: string[] } {
  const entries = [
    ...new Set(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  return {
    urls: entries.filter(isValidWebSeedUrl),
    invalid: entries.filter((entry) => !isValidWebSeedUrl(entry)),
  };
}

export const WEB_SEED_URL_RULE = 'Use an http, https or ftp URL.';
