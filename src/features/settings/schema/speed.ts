import type { SettingField, SettingSection } from './types';

const rateLimit = (key: string, label: string): SettingField => ({
  key,
  label,
  hint: '0 for unlimited.',
  kind: 'int',
  min: 0,
  unit: 'KiB/s',
  wireScale: 1024,
});

export const speed: SettingSection = {
  id: 'speed',
  title: 'Speed',
  groups: [
    {
      title: 'Global rate limits',
      fields: [rateLimit('dl_limit', 'Download limit'), rateLimit('up_limit', 'Upload limit')],
    },
    {
      title: 'Alternative rate limits',
      fields: [
        rateLimit('alt_dl_limit', 'Alternative download limit'),
        rateLimit('alt_up_limit', 'Alternative upload limit'),
        {
          key: 'scheduler_enabled',
          label: 'Schedule the alternative rate limits',
          kind: 'bool',
        },
        {
          key: 'schedule_from_hour',
          minuteKey: 'schedule_from_min',
          label: 'From',
          kind: 'time',
          enabledBy: 'scheduler_enabled',
        },
        {
          key: 'schedule_to_hour',
          minuteKey: 'schedule_to_min',
          label: 'To',
          kind: 'time',
          enabledBy: 'scheduler_enabled',
        },
        {
          key: 'scheduler_days',
          label: 'When',
          kind: 'select',
          options: [
            { value: 0, label: 'Every day' },
            { value: 1, label: 'Weekdays' },
            { value: 2, label: 'Weekends' },
            { value: 3, label: 'Monday' },
            { value: 4, label: 'Tuesday' },
            { value: 5, label: 'Wednesday' },
            { value: 6, label: 'Thursday' },
            { value: 7, label: 'Friday' },
            { value: 8, label: 'Saturday' },
            { value: 9, label: 'Sunday' },
          ],
          enabledBy: 'scheduler_enabled',
        },
      ],
    },
    {
      title: 'Rate limit settings',
      fields: [
        { key: 'limit_utp_rate', label: 'Apply rate limit to µTP protocol', kind: 'bool' },
        {
          key: 'limit_tcp_overhead',
          label: 'Apply rate limit to transport overhead',
          kind: 'bool',
        },
        { key: 'limit_lan_peers', label: 'Apply rate limit to peers on LAN', kind: 'bool' },
      ],
    },
  ],
};
