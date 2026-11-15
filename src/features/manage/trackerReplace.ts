export interface TrackerReplacement {
  url: string;
  newUrl: string;
  hashes: string[];
}

export type TrackerOperation =
  { kind: 'edit'; url: string; newUrl: string } | { kind: 'remove'; url: string };

export interface TrackerReplacePlan {
  replacements: TrackerReplacement[];
  /** Per torrent, in the order they must run. */
  operationsByHash: Map<string, TrackerOperation[]>;
}

export function planTrackerReplace(
  trackerUrls: Map<string, string[]>,
  find: string,
  replaceWith: string,
): TrackerReplacePlan {
  const replacements: TrackerReplacement[] = [];
  const operationsByHash = new Map<string, TrackerOperation[]>();
  if (!find) return { replacements, operationsByHash };

  for (const [url, hashes] of trackerUrls) {
    if (!url.includes(find)) continue;
    const newUrl = url.replaceAll(find, replaceWith).trim();
    if (newUrl && newUrl !== url) replacements.push({ url, newUrl, hashes });
  }

  const urlsByHash = new Map<string, Set<string>>();
  for (const [url, hashes] of trackerUrls) {
    for (const hash of hashes) {
      let urls = urlsByHash.get(hash);
      if (!urls) urlsByHash.set(hash, (urls = new Set()));
      urls.add(url);
    }
  }

  for (const { url, newUrl, hashes } of replacements) {
    for (const hash of hashes) {
      const urls = urlsByHash.get(hash)!;
      let operations = operationsByHash.get(hash);
      if (!operations) operationsByHash.set(hash, (operations = []));
      // qBittorrent rejects an edit to a URL the torrent already has (409), so drop the old one.
      if (urls.has(newUrl)) operations.push({ kind: 'remove', url });
      else operations.push({ kind: 'edit', url, newUrl });
      urls.delete(url);
      urls.add(newUrl);
    }
  }

  return { replacements, operationsByHash };
}
