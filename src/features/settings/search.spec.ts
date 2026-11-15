import { describe, expect, it } from 'vitest';
import { searchSettings, searchWords } from './search';
import type { SettingField, SettingSection } from './schema';

const field = (overrides: Partial<SettingField> & Pick<SettingField, 'key' | 'label'>) =>
  ({ kind: 'int', ...overrides }) satisfies SettingField;

const sections: SettingSection[] = [
  {
    id: 'speed',
    title: 'Speed',
    groups: [
      {
        title: 'Global rate limits',
        fields: [
          field({ key: 'dl_limit', label: 'Download limit', hint: 'Zero means unlimited.' }),
          field({ key: 'up_limit', label: 'Upload limit' }),
        ],
      },
      {
        title: 'Schedule',
        fields: [
          field({
            key: 'schedule_from_hour',
            minuteKey: 'schedule_from_min',
            label: 'From',
            kind: 'time',
          }),
        ],
      },
    ],
  },
  {
    id: 'connection',
    title: 'Connection',
    groups: [
      {
        fields: [
          field({
            key: 'max_connec',
            inlineToggle: 'max_connec_enabled',
            inlineToggleLabel: 'Cap connections',
            label: 'Global maximum connections',
          }),
          field({
            key: 'bittorrent_protocol',
            label: 'Protocol',
            kind: 'select',
            options: [
              { value: 0, label: 'TCP and μTP' },
              { value: 1, label: 'TCP' },
            ],
          }),
          field({
            key: 'limit_value',
            label: 'Rate',
            unitSelect: { key: 'rate_scope', options: [] },
          }),
        ],
      },
    ],
  },
];

const fieldKeysOf = (result: SettingSection[]) =>
  result.flatMap((section) => section.groups.flatMap((group) => group.fields.map((f) => f.key)));

describe('searchWords', () => {
  it('lowercases and splits on any whitespace, ignoring empties', () => {
    expect(searchWords('  Max \t CONN\n')).toEqual(['max', 'conn']);
    expect(searchWords('   ')).toEqual([]);
  });

  it('splits on punctuation and underscores, dropping punctuation-only input', () => {
    expect(searchWords('listen_port')).toEqual(['listen', 'port']);
    expect(searchWords('max-conn.')).toEqual(['max', 'conn']);
    expect(searchWords('_ - /')).toEqual([]);
  });
});

describe('searchSettings', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchSettings(sections, '')).toEqual([]);
    expect(searchSettings(sections, ' \t ')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(fieldKeysOf(searchSettings(sections, 'DOWNLOAD LIMIT'))).toEqual(['dl_limit']);
  });

  it('requires every word to match, in any order', () => {
    expect(fieldKeysOf(searchSettings(sections, 'limit upload'))).toEqual(['up_limit']);
    expect(searchSettings(sections, 'upload download')).toEqual([]);
  });

  it('matches across different fields of the same setting', () => {
    expect(fieldKeysOf(searchSettings(sections, 'download unlimited'))).toEqual(['dl_limit']);
  });

  it('matches by hint', () => {
    expect(fieldKeysOf(searchSettings(sections, 'unlimited'))).toEqual(['dl_limit']);
  });

  it('matches every field of a group by its title', () => {
    expect(fieldKeysOf(searchSettings(sections, 'global rate'))).toEqual(['dl_limit', 'up_limit']);
  });

  it('matches by raw key', () => {
    expect(fieldKeysOf(searchSettings(sections, 'bittorrent_protocol'))).toEqual([
      'bittorrent_protocol',
    ]);
  });

  it('matches by companion keys', () => {
    expect(fieldKeysOf(searchSettings(sections, 'max_connec_enabled'))).toEqual(['max_connec']);
    expect(fieldKeysOf(searchSettings(sections, 'schedule_from_min'))).toEqual([
      'schedule_from_hour',
    ]);
    expect(fieldKeysOf(searchSettings(sections, 'rate_scope'))).toEqual(['limit_value']);
  });

  it('matches by inline toggle label', () => {
    expect(fieldKeysOf(searchSettings(sections, 'cap'))).toEqual(['max_connec']);
  });

  it('matches by option label', () => {
    expect(fieldKeysOf(searchSettings(sections, 'μtp'))).toEqual(['bittorrent_protocol']);
  });

  it('keeps only matching fields and prunes emptied groups and sections', () => {
    const result = searchSettings(sections, 'upload');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('speed');
    expect(result[0]!.groups).toHaveLength(1);
    expect(result[0]!.groups[0]!.title).toBe('Global rate limits');
    expect(result[0]!.groups[0]!.fields.map((f) => f.key)).toEqual(['up_limit']);
  });

  it('returns nothing when no field matches', () => {
    expect(searchSettings(sections, 'nonexistent')).toEqual([]);
  });

  it('does not modify the sections it searches', () => {
    const before = structuredClone(sections);
    searchSettings(sections, 'upload');
    expect(sections).toEqual(before);
  });

  describe('word prefixes', () => {
    const portSections: SettingSection[] = [
      {
        id: 'connection',
        title: 'Connection',
        groups: [
          {
            fields: [
              field({ key: 'listen_port', label: 'Listening port' }),
              field({ key: 'secure_channel', label: 'Transport security' }),
              field({ key: 'help_link', label: 'Help', hint: 'Support options.' }),
            ],
          },
        ],
      },
    ];

    it('matches the start of a word, not the middle or end', () => {
      expect(fieldKeysOf(searchSettings(portSections, 'port'))).toEqual(['listen_port']);
      expect(fieldKeysOf(searchSettings(portSections, 'list'))).toEqual(['listen_port']);
      expect(searchSettings(portSections, 'ening')).toEqual([]);
    });

    it('treats a snake_case query as consecutive prefixes of any words', () => {
      expect(fieldKeysOf(searchSettings(portSections, 'listen_port'))).toEqual(['listen_port']);
      expect(searchSettings(portSections, 'secure_port')).toEqual([]);
    });

    it('returns nothing for a punctuation-only query', () => {
      expect(searchSettings(portSections, '_ - /')).toEqual([]);
    });
  });
});
