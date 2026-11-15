import type { Draft, SettingField, SettingSection } from './types';

const proxyInUse = (draft: Draft) => draft.proxy_type !== 'None';
const proxySupportsAuthAndLookups = (draft: Draft) =>
  draft.proxy_type === 'HTTP' || draft.proxy_type === 'SOCKS5';

const i2pField = (field: Omit<SettingField, 'enabledBy'>): SettingField => ({
  ...field,
  enabledBy: 'i2p_enabled',
});

export const connection: SettingSection = {
  id: 'connection',
  title: 'Connection',
  groups: [
    {
      title: 'Listening',
      fields: [
        {
          key: 'bittorrent_protocol',
          label: 'Peer connection protocol',
          kind: 'select',
          options: [
            { value: 0, label: 'TCP and µTP' },
            { value: 1, label: 'TCP' },
            { value: 2, label: 'µTP' },
          ],
        },
        {
          key: 'listen_port',
          label: 'Listening port',
          hint: '0 picks a random port on each startup.',
          kind: 'int',
          min: 0,
          max: 65535,
        },
        { key: 'upnp', label: 'UPnP / NAT-PMP port forwarding', kind: 'bool' },
        {
          key: 'ssl_listen_port',
          label: 'SSL torrents port',
          hint: 'Listening port for torrents that carry an SSL certificate.',
          kind: 'int',
          min: 0,
          max: 65535,
          inlineToggle: 'ssl_enabled',
          inlineToggleLabel: 'Enable SSL torrents',
        },
      ],
    },
    {
      title: 'Connection limits',
      hint: '-1 for unlimited.',
      fields: [
        {
          key: 'max_connec',
          label: 'Max connections',
          kind: 'int',
          min: -1,
        },
        {
          key: 'max_connec_per_torrent',
          label: 'Max connections per torrent',
          kind: 'int',
          min: -1,
        },
        { key: 'max_uploads', label: 'Max upload slots', kind: 'int', min: -1 },
        {
          key: 'max_uploads_per_torrent',
          label: 'Max upload slots per torrent',
          kind: 'int',
          min: -1,
        },
      ],
    },
    {
      title: 'I2P (experimental)',
      fields: [
        { key: 'i2p_enabled', label: 'Enable I2P', kind: 'bool' },
        i2pField({ key: 'i2p_address', label: 'Host', kind: 'text' }),
        i2pField({ key: 'i2p_port', label: 'Port', kind: 'int', min: 0, max: 65535 }),
        i2pField({
          key: 'i2p_mixed_mode',
          label: 'Mixed mode',
          hint: 'I2P torrents may also get peers from other sources and connect to regular IPs, without anonymization.',
          kind: 'bool',
        }),
        i2pField({
          key: 'i2p_pex_enabled',
          label: 'I2P peer exchange',
          hint: 'Requires a restart.',
          kind: 'bool',
        }),
        i2pField({
          key: 'i2p_inbound_quantity',
          label: 'Inbound tunnels',
          kind: 'int',
          min: 1,
          max: 16,
        }),
        i2pField({
          key: 'i2p_outbound_quantity',
          label: 'Outbound tunnels',
          kind: 'int',
          min: 1,
          max: 16,
        }),
        i2pField({
          key: 'i2p_inbound_length',
          label: 'Inbound tunnel length',
          kind: 'int',
          min: 0,
          max: 7,
          unit: 'hops',
        }),
        i2pField({
          key: 'i2p_outbound_length',
          label: 'Outbound tunnel length',
          kind: 'int',
          min: 0,
          max: 7,
          unit: 'hops',
        }),
        i2pField({
          key: 'i2p_inbound_length_variance',
          label: 'Inbound tunnel length variance',
          kind: 'int',
          min: -7,
          max: 7,
        }),
        i2pField({
          key: 'i2p_outbound_length_variance',
          label: 'Outbound tunnel length variance',
          kind: 'int',
          min: -7,
          max: 7,
        }),
      ],
    },
    {
      title: 'Proxy server',
      fields: [
        {
          key: 'proxy_type',
          label: 'Type',
          kind: 'select',
          options: [
            { value: 'None', label: 'None' },
            { value: 'HTTP', label: 'HTTP' },
            { value: 'SOCKS5', label: 'SOCKS5' },
            { value: 'SOCKS4', label: 'SOCKS4' },
          ],
        },
        { key: 'proxy_ip', label: 'Host', kind: 'text', visibleWhen: proxyInUse },
        {
          key: 'proxy_port',
          label: 'Port',
          kind: 'int',
          min: 1,
          max: 65535,
          visibleWhen: proxyInUse,
        },
        {
          key: 'proxy_hostname_lookup',
          label: 'Perform hostname lookup via proxy',
          kind: 'bool',
          visibleWhen: proxySupportsAuthAndLookups,
        },
        {
          key: 'proxy_auth_enabled',
          label: 'Proxy authentication',
          kind: 'bool',
          visibleWhen: proxySupportsAuthAndLookups,
        },
        {
          key: 'proxy_username',
          label: 'Username',
          kind: 'text',
          enabledBy: 'proxy_auth_enabled',
          visibleWhen: proxySupportsAuthAndLookups,
        },
        {
          key: 'proxy_password',
          label: 'Password',
          kind: 'secret',
          enabledBy: 'proxy_auth_enabled',
          visibleWhen: proxySupportsAuthAndLookups,
        },
        {
          key: 'proxy_bittorrent',
          label: 'Use proxy for BitTorrent purposes',
          kind: 'bool',
          visibleWhen: proxyInUse,
        },
        {
          key: 'proxy_peer_connections',
          label: 'Use proxy for peer connections',
          kind: 'bool',
          enabledBy: 'proxy_bittorrent',
          visibleWhen: proxyInUse,
        },
        {
          key: 'proxy_rss',
          label: 'Use proxy for RSS purposes',
          kind: 'bool',
          visibleWhen: proxySupportsAuthAndLookups,
        },
        {
          key: 'proxy_misc',
          label: 'Use proxy for general purposes',
          kind: 'bool',
          visibleWhen: proxySupportsAuthAndLookups,
        },
      ],
    },
    {
      title: 'IP filtering',
      fields: [
        {
          key: 'ip_filter_path',
          label: 'Filter file',
          hint: '.dat, .p2p or .p2b file on the qBittorrent host.',
          kind: 'file',
          inlineToggle: 'ip_filter_enabled',
          inlineToggleLabel: 'Use an IP filter',
        },
        {
          key: 'ip_filter_trackers',
          label: 'Apply to trackers',
          kind: 'bool',
          enabledBy: 'ip_filter_enabled',
        },
        {
          key: 'banned_IPs',
          label: 'Manually banned IP addresses',
          hint: 'One per line.',
          kind: 'multiline',
        },
      ],
    },
  ],
};
