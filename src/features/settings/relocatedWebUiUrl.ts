import type { RawPreferences } from '@/types/qbit';

const LISTENS_ON_EVERY_ADDRESS = new Set(['', '*', '0.0.0.0', '::']);

export function relocatedWebUiUrl(
  prefs: RawPreferences,
  current: Pick<Location, 'hostname' | 'pathname'>,
): string {
  const scheme = prefs.use_https === true ? 'https' : 'http';
  const address = String(prefs.web_ui_address ?? '').trim();
  const host = LISTENS_ON_EVERY_ADDRESS.has(address) ? current.hostname : address;
  const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${scheme}://${bracketedHost}:${prefs.web_ui_port}${current.pathname}`;
}
