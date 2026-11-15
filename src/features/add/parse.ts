const LINK = /^(magnet:\?|https?:\/\/|bc:\/\/bt\/)/i;
const BTIH = /^([0-9a-f]{40}|[a-z2-7]{32})$/i;

export interface ParsedLinks {
  links: string[];
  invalid: string[];
}

/** Splits pasted or dropped text into links. Bare info hashes become magnet links. */
export function parseLinks(text: string): ParsedLinks {
  const links: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue; // text/uri-list comments
    const link = LINK.test(line) ? line : BTIH.test(line) ? `magnet:?xt=urn:btih:${line}` : null;
    if (!link) invalid.push(line);
    else if (!seen.has(link)) {
      seen.add(link);
      links.push(link);
    }
  }
  return { links, invalid };
}

export function isTorrentFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.torrent') || file.type === 'application/x-bittorrent';
}

/** Display name for a link: the magnet's dn, else the URL's last path segment. */
export function linkLabel(link: string): string {
  if (link.toLowerCase().startsWith('magnet:')) {
    const params = new URLSearchParams(link.slice(link.indexOf('?') + 1));
    return params.get('dn') ?? params.get('xt')?.replace(/^urn:btih:/i, '') ?? link;
  }
  try {
    const url = new URL(link);
    return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? url.host);
  } catch {
    return link;
  }
}
