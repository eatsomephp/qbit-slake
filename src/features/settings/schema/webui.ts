import type { DangerKind, SettingField, SettingSection } from './types';

const dyndnsField = (field: Omit<SettingField, 'enabledBy'>): SettingField => ({
  ...field,
  enabledBy: 'dyndns_enabled',
});

export const webui: SettingSection = {
  id: 'webui',
  title: 'Web UI',
  groups: [
    {
      title: 'Interface',
      fields: [
        {
          key: 'web_ui_address',
          label: 'IP address',
          hint: '* listens on all IPv4 and IPv6 addresses.',
          kind: 'text',
          danger: 'reconnect',
        },
        {
          key: 'web_ui_port',
          label: 'Port',
          kind: 'int',
          min: 1,
          max: 65535,
          danger: 'reconnect',
        },
        {
          key: 'web_ui_upnp',
          label: 'Forward the port with UPnP / NAT-PMP',
          kind: 'bool',
        },
      ],
    },
    {
      title: 'HTTPS',
      fields: [
        { key: 'use_https', label: 'Use HTTPS instead of HTTP', kind: 'bool', danger: 'reconnect' },
        {
          key: 'web_ui_https_cert_path',
          label: 'Certificate',
          kind: 'file',
          enabledBy: 'use_https',
          danger: 'reconnect',
        },
        {
          key: 'web_ui_https_key_path',
          label: 'Key',
          kind: 'file',
          enabledBy: 'use_https',
          danger: 'reconnect',
        },
      ],
    },
    {
      title: 'Authentication',
      fields: [
        { key: 'web_ui_username', label: 'Username', kind: 'text', danger: 'auth' },
        {
          key: 'web_ui_password',
          label: 'New password',
          hint: 'Leave empty to keep the current password.',
          kind: 'newPassword',
          confirmKey: 'web_ui_password_confirm',
          presenceKey: 'web_ui_username',
          danger: 'auth',
        },
        {
          key: 'bypass_local_auth',
          label: 'Bypass authentication for clients on localhost',
          kind: 'bool',
          danger: 'auth',
        },
        {
          key: 'bypass_auth_subnet_whitelist',
          label: 'Bypass authentication for clients in whitelisted subnets',
          hint: 'One subnet per line, for example 192.168.0.0/24.',
          kind: 'multiline',
          inlineToggle: 'bypass_auth_subnet_whitelist_enabled',
          inlineToggleLabel: 'Bypass authentication for whitelisted subnets',
          danger: 'auth',
        },
        {
          key: 'web_ui_max_auth_fail_count',
          label: 'Ban a client after consecutive failures',
          hint: '0 never bans.',
          kind: 'int',
          min: 0,
          danger: 'auth',
        },
        {
          key: 'web_ui_ban_duration',
          label: 'Ban for',
          kind: 'int',
          min: 1,
          unit: 's',
          danger: 'auth',
        },
        {
          key: 'web_ui_session_timeout',
          label: 'Session timeout',
          hint: '0 disables it.',
          kind: 'int',
          min: 0,
          unit: 's',
        },
        {
          key: 'web_ui_sessions_count_limit',
          label: 'Max concurrent sessions',
          hint: '0 for unlimited.',
          kind: 'int',
          min: 0,
        },
      ],
    },
    {
      title: 'API key',
      fields: [
        {
          key: 'web_ui_api_key',
          label: 'API key',
          hint: 'Lets scripts and apps call the WebAPI without logging in. Generating or deleting a key takes effect immediately.',
          kind: 'apiKey',
          readonly: true,
        },
      ],
    },
    {
      title: 'Alternative Web UI',
      fields: [
        {
          key: 'alternative_webui_enabled',
          label: 'Use an alternative Web UI',
          hint: 'This UI is the alternative Web UI. Turning this off brings back the built-in one.',
          kind: 'bool',
          danger: 'lockout',
          isDangerousValue: (wireValue) => wireValue === false,
        },
        {
          key: 'alternative_webui_path',
          label: 'Files location',
          kind: 'path',
          enabledBy: 'alternative_webui_enabled',
          danger: 'lockout',
        },
      ],
    },
    {
      title: 'Security',
      fields: [
        {
          key: 'web_ui_clickjacking_protection_enabled',
          label: 'Clickjacking protection',
          kind: 'bool',
        },
        {
          key: 'web_ui_csrf_protection_enabled',
          label: 'Cross-Site Request Forgery (CSRF) protection',
          kind: 'bool',
          danger: 'access',
        },
        {
          key: 'web_ui_secure_cookie_enabled',
          label: 'Secure cookie flag',
          hint: 'Needs HTTPS or a localhost connection.',
          kind: 'bool',
          danger: 'access',
        },
        {
          key: 'web_ui_host_header_validation_enabled',
          label: 'Host header validation',
          kind: 'bool',
          danger: 'access',
        },
        {
          key: 'web_ui_domain_list',
          label: 'Server domains',
          hint: 'Separate entries with ;. The * wildcard is allowed.',
          kind: 'text',
          enabledBy: 'web_ui_host_header_validation_enabled',
          danger: 'access',
        },
        {
          key: 'web_ui_use_custom_http_headers_enabled',
          label: 'Add custom HTTP headers',
          kind: 'bool',
        },
        {
          key: 'web_ui_custom_http_headers',
          label: 'Headers',
          hint: 'One per line, as name: value.',
          kind: 'multiline',
          enabledBy: 'web_ui_use_custom_http_headers_enabled',
        },
        {
          key: 'web_ui_reverse_proxy_enabled',
          label: 'Reverse proxy support',
          kind: 'bool',
          danger: 'access',
        },
        {
          key: 'web_ui_reverse_proxies_list',
          label: 'Trusted proxies',
          hint: 'Separate IPs with ;.',
          kind: 'text',
          enabledBy: 'web_ui_reverse_proxy_enabled',
          danger: 'access',
        },
      ],
    },
    {
      title: 'Dynamic DNS',
      fields: [
        { key: 'dyndns_enabled', label: 'Update my dynamic domain name', kind: 'bool' },
        dyndnsField({
          key: 'dyndns_service',
          label: 'Service',
          kind: 'select',
          options: [
            { value: 0, label: 'DynDNS' },
            { value: 1, label: 'No-IP' },
          ],
        }),
        dyndnsField({ key: 'dyndns_domain', label: 'Domain name', kind: 'text' }),
        dyndnsField({ key: 'dyndns_username', label: 'Username', kind: 'text' }),
        dyndnsField({ key: 'dyndns_password', label: 'Password', kind: 'secret' }),
      ],
    },
  ],
};

export const DANGER_CONSEQUENCES = {
  lockout: 'This UI stops loading. qBittorrent serves its built-in Web UI instead.',
  reconnect:
    "The Web UI's address changes. This page shows the new address after saving; behind a reverse proxy, update the proxy instead.",
  auth: 'You might need to log in again, and typos can get your IP banned.',
  access: 'Wrong values can block requests, especially behind a reverse proxy.',
} satisfies Record<DangerKind, string>;
