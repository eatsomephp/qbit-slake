import type { SettingSection } from './types';

export const rss: SettingSection = {
  id: 'rss',
  title: 'RSS',
  groups: [
    {
      title: 'RSS reader',
      fields: [
        { key: 'rss_processing_enabled', label: 'Enable fetching RSS feeds', kind: 'bool' },
        {
          key: 'rss_refresh_interval',
          label: 'Feeds refresh interval',
          kind: 'int',
          min: 1,
          unit: 'min',
        },
        {
          key: 'rss_fetch_delay',
          label: 'Same host request delay',
          hint: 'Wait between requests to the same host, to avoid getting banned.',
          kind: 'int',
          min: 0,
          unit: 's',
        },
        {
          key: 'rss_max_articles_per_feed',
          label: 'Maximum number of articles per feed',
          kind: 'int',
          min: 0,
        },
      ],
    },
    {
      title: 'RSS torrent auto downloader',
      fields: [
        {
          key: 'rss_auto_downloading_enabled',
          label: 'Enable auto downloading of RSS torrents',
          kind: 'bool',
        },
      ],
    },
    {
      title: 'RSS smart episode filter',
      fields: [
        {
          key: 'rss_download_repack_proper_episodes',
          label: 'Download REPACK/PROPER episodes',
          kind: 'bool',
        },
        {
          key: 'rss_smart_episode_filters',
          label: 'Filters',
          hint: 'One regular expression per line.',
          kind: 'multiline',
        },
      ],
    },
  ],
};
