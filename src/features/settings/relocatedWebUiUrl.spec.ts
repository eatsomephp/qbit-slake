import { describe, expect, it } from 'vitest';
import type { RawPreferences } from '@/types/qbit';
import { relocatedWebUiUrl } from './relocatedWebUiUrl';

const current = { hostname: 'nas.local', pathname: '/' };
const prefs = (keys: Record<string, unknown>) => keys as RawPreferences;

describe('relocatedWebUiUrl', () => {
  it('builds the URL from the scheme, address and port', () => {
    expect(
      relocatedWebUiUrl(
        prefs({ use_https: false, web_ui_address: '192.168.1.5', web_ui_port: 9090 }),
        current,
      ),
    ).toBe('http://192.168.1.5:9090/');
  });

  it('uses https when HTTPS is on', () => {
    expect(
      relocatedWebUiUrl(
        prefs({ use_https: true, web_ui_address: '10.0.0.2', web_ui_port: 8443 }),
        current,
      ),
    ).toBe('https://10.0.0.2:8443/');
  });

  it.each(['*', '', '0.0.0.0', '::', ' * '])(
    'falls back to the current hostname for the any-address value %j',
    (address) => {
      expect(
        relocatedWebUiUrl(prefs({ use_https: false, web_ui_address: address, web_ui_port: 8080 }), {
          hostname: 'seedbox.example',
          pathname: '/',
        }),
      ).toBe('http://seedbox.example:8080/');
    },
  );

  it('brackets an IPv6 address', () => {
    expect(
      relocatedWebUiUrl(prefs({ web_ui_address: 'fe80::1', web_ui_port: 8080 }), current),
    ).toBe('http://[fe80::1]:8080/');
  });

  it('does not double-bracket an already bracketed address', () => {
    expect(
      relocatedWebUiUrl(prefs({ web_ui_address: '[fe80::1]', web_ui_port: 8080 }), current),
    ).toBe('http://[fe80::1]:8080/');
  });

  it('keeps the current path', () => {
    expect(
      relocatedWebUiUrl(prefs({ web_ui_address: '*', web_ui_port: 8080 }), {
        hostname: 'nas.local',
        pathname: '/settings',
      }),
    ).toBe('http://nas.local:8080/settings');
  });
});
