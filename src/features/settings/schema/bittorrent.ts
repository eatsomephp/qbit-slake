import { ShareLimitAction } from '@/constants/qbit';
import type { SettingSection } from './types';

export const bittorrent: SettingSection = {
  id: 'bittorrent',
  title: 'BitTorrent',
  groups: [
    {
      title: 'Privacy',
      fields: [
        { key: 'dht', label: 'DHT', kind: 'bool' },
        { key: 'pex', label: 'Peer exchange (PeX)', kind: 'bool' },
        { key: 'lsd', label: 'Local peer discovery', kind: 'bool' },
        {
          key: 'encryption',
          label: 'Encryption',
          kind: 'select',
          options: [
            { value: 0, label: 'Allow' },
            { value: 1, label: 'Require' },
            { value: 2, label: 'Disable' },
          ],
        },
        { key: 'anonymous_mode', label: 'Anonymous mode', kind: 'bool' },
      ],
    },
    {
      fields: [
        {
          key: 'max_active_checking_torrents',
          label: 'Max active checking torrents',
          hint: '-1 for unlimited.',
          kind: 'int',
          min: -1,
        },
      ],
    },
    {
      title: 'Queueing',
      fields: [
        { key: 'queueing_enabled', label: 'Torrent queueing', kind: 'bool' },
        {
          key: 'max_active_downloads',
          hint: '-1 for unlimited.',
          label: 'Max active downloads',
          kind: 'int',
          min: -1,
          enabledBy: 'queueing_enabled',
        },
        {
          key: 'max_active_uploads',
          hint: '-1 for unlimited.',
          label: 'Max active uploads',
          kind: 'int',
          min: -1,
          enabledBy: 'queueing_enabled',
        },
        {
          key: 'max_active_torrents',
          hint: '-1 for unlimited.',
          label: 'Max active torrents',
          kind: 'int',
          min: -1,
          enabledBy: 'queueing_enabled',
        },
        {
          key: 'dont_count_slow_torrents',
          label: "Don't count slow torrents in these limits",
          kind: 'bool',
          enabledBy: 'queueing_enabled',
        },
        {
          key: 'slow_torrent_dl_rate_threshold',
          label: 'Download rate threshold',
          kind: 'int',
          min: 0,
          unit: 'KiB/s',
          enabledBy: 'dont_count_slow_torrents',
        },
        {
          key: 'slow_torrent_ul_rate_threshold',
          label: 'Upload rate threshold',
          kind: 'int',
          min: 0,
          unit: 'KiB/s',
          enabledBy: 'dont_count_slow_torrents',
        },
        {
          key: 'slow_torrent_inactive_timer',
          label: 'Torrent inactivity timer',
          kind: 'int',
          min: 1,
          unit: 'seconds',
          enabledBy: 'dont_count_slow_torrents',
        },
      ],
    },
    {
      title: 'Seeding limits',
      fields: [
        {
          key: 'max_ratio',
          label: 'When ratio reaches',
          kind: 'float',
          min: 0,
          step: '0.01',
          inlineToggle: 'max_ratio_enabled',
          inlineToggleLabel: 'Limit ratio',
        },
        {
          key: 'max_seeding_time',
          label: 'When seeding time reaches',
          kind: 'int',
          min: 0,
          unit: 'minutes',
          inlineToggle: 'max_seeding_time_enabled',
          inlineToggleLabel: 'Limit seeding time',
        },
        {
          key: 'max_inactive_seeding_time',
          label: 'When inactive seeding time reaches',
          kind: 'int',
          min: 0,
          unit: 'minutes',
          inlineToggle: 'max_inactive_seeding_time_enabled',
          inlineToggleLabel: 'Limit inactive seeding time',
        },
        {
          key: 'share_limits_mode',
          label: 'Act when',
          kind: 'select',
          options: [
            { value: 'MatchAny', label: 'Any limit is reached' },
            { value: 'MatchAll', label: 'All enabled limits are reached' },
          ],
        },
        {
          key: 'max_ratio_act',
          label: 'Then',
          kind: 'select',
          options: [
            { value: ShareLimitAction.Stop, label: 'Stop torrent' },
            { value: ShareLimitAction.Remove, label: 'Remove torrent' },
            { value: ShareLimitAction.RemoveWithContent, label: 'Remove torrent and files' },
            { value: ShareLimitAction.EnableSuperSeeding, label: 'Enable super seeding' },
          ],
        },
      ],
    },
    {
      title: 'Trackers',
      fields: [
        {
          key: 'add_trackers',
          label: 'Append these trackers to new downloads',
          hint: 'One tracker URL per line.',
          kind: 'multiline',
          inlineToggle: 'add_trackers_enabled',
          inlineToggleLabel: 'Automatically append trackers',
        },
        {
          key: 'add_trackers_url',
          label: 'Append trackers from this URL',
          kind: 'text',
          inlineToggle: 'add_trackers_from_url_enabled',
          inlineToggleLabel: 'Automatically append trackers from a URL',
        },
        {
          key: 'add_trackers_url_list',
          label: 'Trackers fetched from the URL',
          kind: 'multiline',
          readonly: true,
          enabledBy: 'add_trackers_from_url_enabled',
        },
      ],
    },
  ],
};
