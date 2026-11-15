import type { SettingSection } from './types';

export const behavior: SettingSection = {
  id: 'behavior',
  title: 'Behavior',
  groups: [
    {
      title: 'Log file',
      fields: [
        { key: 'file_log_enabled', label: 'Log to file', kind: 'bool' },
        { key: 'file_log_path', label: 'Save path', kind: 'path', enabledBy: 'file_log_enabled' },
        {
          key: 'file_log_max_size',
          label: 'Back up the log file after',
          kind: 'int',
          min: 1,
          max: 1024000,
          unit: 'KiB',
          inlineToggle: 'file_log_backup_enabled',
          inlineToggleLabel: 'Back up the log file',
          enabledBy: 'file_log_enabled',
        },
        {
          key: 'file_log_age',
          label: 'Delete backup logs older than',
          kind: 'int',
          min: 1,
          max: 365,
          inlineToggle: 'file_log_delete_old',
          inlineToggleLabel: 'Delete old backup logs',
          unitSelect: {
            key: 'file_log_age_type',
            options: [
              { value: 0, label: 'days' },
              { value: 1, label: 'months' },
              { value: 2, label: 'years' },
            ],
          },
          enabledBy: 'file_log_enabled',
        },
        { key: 'performance_warning', label: 'Log performance warnings', kind: 'bool' },
      ],
    },
    {
      title: "qBittorrent's built-in interface",
      hint: "Applies to qBittorrent's own Web UI and desktop app, not this UI.",
      fields: [
        { key: 'confirm_torrent_deletion', label: 'Confirm when deleting torrents', kind: 'bool' },
        {
          key: 'delete_torrent_content_files',
          label: 'Delete files by default',
          hint: 'Pre-tick "Also delete files" when removing torrents.',
          kind: 'bool',
        },
        { key: 'confirm_torrent_recheck', label: 'Confirm when rechecking torrents', kind: 'bool' },
        { key: 'confirm_remove_all_tags', label: 'Confirm when removing all tags', kind: 'bool' },
        {
          key: 'confirm_remove_tracker_from_all_torrents',
          label: 'Confirm when removing a tracker from all torrents',
          kind: 'bool',
        },
        {
          key: 'status_bar_external_ip',
          label: 'Show external IP in the status bar',
          kind: 'bool',
        },
        {
          key: 'refresh_interval',
          label: 'Refresh interval',
          kind: 'int',
          min: 30,
          max: 99999,
          unit: 'ms',
        },
      ],
    },
    {
      title: 'Search',
      fields: [
        { key: 'store_search_jobs', label: 'Restore search tabs on startup', kind: 'bool' },
        {
          key: 'store_search_job_results',
          label: 'Also restore search results',
          kind: 'bool',
          enabledBy: 'store_search_jobs',
        },
      ],
    },
  ],
};
