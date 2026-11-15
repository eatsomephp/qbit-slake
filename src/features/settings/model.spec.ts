import { describe, expect, it } from 'vitest';
import { ShareLimitAction } from '@/constants/qbit';
import type { RawPreferences } from '@/types/qbit';
import { SECTIONS, type SettingField } from './schema';
import {
  dangerousChanges,
  draftProblems,
  fromPreferences,
  isEnabledBySettings,
  renderedSections,
  sectionOfKey,
  sectionsWithChanges,
  sectionsWithProblems,
  settingLabel,
  toPreferenceChanges,
  unappliedKeys,
  unrecognizedFields,
} from './model';

const raw = (keys: Record<string, unknown>) => keys as RawPreferences;

const prefs = raw({
  save_path: '/dl',
  temp_path_enabled: false,
  temp_path: '/tmp',
  listen_port: 6881,
  dht: true,
  dl_limit: 0,
  up_limit: 1024 * 1024,
  alt_dl_limit: 10 * 1024,
  alt_up_limit: 0,
  queueing_enabled: true,
  max_active_downloads: 3,
  max_ratio_enabled: false,
  max_ratio: -1,
  max_seeding_time_enabled: true,
  max_seeding_time: 120,
  max_ratio_act: 'Remove',
});

const fieldKeys = (sections: ReturnType<typeof renderedSections>) =>
  sections.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => f.key)));

describe('fromPreferences', () => {
  it('keys the draft by raw preference key and divides wireScale into KiB/s', () => {
    const draft = fromPreferences(prefs);
    expect(draft.up_limit).toBe(1024);
    expect(draft.alt_dl_limit).toBe(10);
    expect(draft.save_path).toBe('/dl');
    expect(draft.dht).toBe(true);
  });

  it('keeps scaled values at or below zero as they are', () => {
    const draft = fromPreferences({ ...prefs, dl_limit: -1, alt_up_limit: 0 });
    expect(draft.dl_limit).toBe(-1);
    expect(draft.alt_up_limit).toBe(0);
  });

  it('leaves out keys the server did not send', () => {
    expect(fromPreferences(raw({ dht: true }))).not.toHaveProperty('save_path');
  });

  it('reads share limits, defaulting a disabled value to something sensible to edit from', () => {
    const draft = fromPreferences(prefs);
    expect(draft.max_ratio_enabled).toBe(false);
    expect(draft.max_ratio).toBe(1);
    expect(draft.max_seeding_time_enabled).toBe(true);
    expect(draft.max_seeding_time).toBe(120);
    expect(draft.max_ratio_act).toBe(ShareLimitAction.Remove);
  });

  it('derives the enabled flags from the values when the server omits them', () => {
    const rest: RawPreferences = { ...prefs, max_ratio: 2, max_seeding_time: -1 };
    delete rest.max_ratio_enabled;
    delete rest.max_seeding_time_enabled;
    const draft = fromPreferences(rest);
    expect(draft.max_ratio_enabled).toBe(true);
    expect(draft.max_seeding_time_enabled).toBe(false);
  });

  it('reads numeric share actions', () => {
    expect(fromPreferences({ ...prefs, max_ratio_act: 3 }).max_ratio_act).toBe(
      ShareLimitAction.RemoveWithContent,
    );
  });

  it('copies object values so editing the draft cannot touch the loaded preferences', () => {
    const loaded = raw({ ...prefs, future_map: { a: 1 } });
    const draft = fromPreferences(loaded);
    expect(draft.future_map).toEqual({ a: 1 });
    expect(draft.future_map).not.toBe(loaded.future_map);
  });
});

describe('toPreferenceChanges', () => {
  it('is empty when nothing changed', () => {
    expect(toPreferenceChanges(prefs, fromPreferences(prefs), '2.16.0')).toEqual({});
  });

  it('sends only changed keys, scaled keys back in bytes/s', () => {
    const draft = { ...fromPreferences(prefs), dl_limit: 500, dht: false, save_path: '/data' };
    expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({
      dl_limit: 512_000,
      dht: false,
      save_path: '/data',
    });
  });

  it('does not scale a value at or below zero', () => {
    const draft = { ...fromPreferences(prefs), up_limit: 0 };
    expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({ up_limit: 0 });
  });

  it('sends an inline toggle key on its own, unscaled', () => {
    const draft = { ...fromPreferences(prefs), temp_path_enabled: true };
    expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({ temp_path_enabled: true });
  });

  it('never sends keys the server did not return', () => {
    const draft = { ...fromPreferences(raw({ dht: true })), save_path: '/x' };
    expect(toPreferenceChanges(raw({ dht: true }), draft, '2.16.0')).toEqual({});
  });

  it('never sends read-only keys, even when the draft differs', () => {
    const original = raw({
      ...prefs,
      add_trackers_url_list: 'udp://a',
      future_map: { a: { b: [1, 2] } },
    });
    const draft = {
      ...fromPreferences(original),
      add_trackers_url_list: 'udp://b',
      future_map: { a: { b: [1, 3] } },
    };
    expect(toPreferenceChanges(original, draft, '2.16.0')).toEqual({});
  });

  it('diffs unrecognized keys by their raw value', () => {
    const original = raw({ ...prefs, future_flag: false, future_name: 'a' });
    const draft = { ...fromPreferences(original), future_flag: true, future_name: 'b' };
    expect(toPreferenceChanges(original, draft, '2.16.0')).toEqual({
      future_flag: true,
      future_name: 'b',
    });
  });

  describe('share limits', () => {
    const enableRatioDisableTime = {
      max_ratio_enabled: true,
      max_ratio: 2,
      max_seeding_time_enabled: false,
    };

    it('from WebAPI 2.11.6 sends only the value, -1 to disable', () => {
      const draft = { ...fromPreferences(prefs), ...enableRatioDisableTime };
      expect(toPreferenceChanges(prefs, draft, '2.11.6')).toEqual({
        max_ratio: 2,
        max_seeding_time: -1,
      });
    });

    it('before 2.11.6 sends both the flag and the value', () => {
      const draft = { ...fromPreferences(prefs), ...enableRatioDisableTime };
      expect(toPreferenceChanges(prefs, draft, '2.11.0')).toEqual({
        max_ratio: 2,
        max_ratio_enabled: true,
        max_seeding_time: 120,
        max_seeding_time_enabled: false,
      });
    });

    it('ignores edits to a disabled limit value', () => {
      const draft = { ...fromPreferences(prefs), max_ratio: 5 };
      expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({});
    });

    it('keeps the server form for the share action: string or number', () => {
      const draft = {
        ...fromPreferences(prefs),
        max_ratio_act: ShareLimitAction.EnableSuperSeeding,
      };
      expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({
        max_ratio_act: 'EnableSuperSeeding',
      });
      const numeric = { ...prefs, max_ratio_act: 0 };
      const numericDraft = {
        ...fromPreferences(numeric),
        max_ratio_act: ShareLimitAction.RemoveWithContent,
      };
      expect(toPreferenceChanges(numeric, numericDraft, '2.11.0')).toEqual({ max_ratio_act: 3 });
    });

    describe('inactive seeding time', () => {
      const withInactive = raw({
        ...prefs,
        max_inactive_seeding_time_enabled: false,
        max_inactive_seeding_time: -1,
      });
      const enabledAt30 = {
        ...fromPreferences(withInactive),
        max_inactive_seeding_time_enabled: true,
        max_inactive_seeding_time: 30,
      };

      it('reads a disabled value as 1440 minutes to edit from', () => {
        const draft = fromPreferences(withInactive);
        expect(draft.max_inactive_seeding_time_enabled).toBe(false);
        expect(draft.max_inactive_seeding_time).toBe(1440);
      });

      it('from WebAPI 2.11.6 sends only the value, then -1 to disable', () => {
        expect(toPreferenceChanges(withInactive, enabledAt30, '2.11.6')).toEqual({
          max_inactive_seeding_time: 30,
        });
        const enabled = raw({
          ...withInactive,
          max_inactive_seeding_time_enabled: true,
          max_inactive_seeding_time: 30,
        });
        const disabled = { ...fromPreferences(enabled), max_inactive_seeding_time_enabled: false };
        expect(toPreferenceChanges(enabled, disabled, '2.11.6')).toEqual({
          max_inactive_seeding_time: -1,
        });
      });

      it('before 2.11.6 sends both the flag and the value', () => {
        expect(toPreferenceChanges(withInactive, enabledAt30, '2.11.0')).toEqual({
          max_inactive_seeding_time: 30,
          max_inactive_seeding_time_enabled: true,
        });
      });

      it('derives the flag from the value when the server omits it', () => {
        const on = raw({ ...prefs, max_inactive_seeding_time: 45 });
        const off = raw({ ...prefs, max_inactive_seeding_time: -1 });
        expect(fromPreferences(on).max_inactive_seeding_time_enabled).toBe(true);
        expect(fromPreferences(off).max_inactive_seeding_time_enabled).toBe(false);
      });

      it('is left alone when the server does not return it', () => {
        const draft = fromPreferences(prefs);
        expect(draft).not.toHaveProperty('max_inactive_seeding_time');
        expect(toPreferenceChanges(prefs, draft, '2.16.0')).toEqual({});
      });
    });
  });

  describe('scheduler times', () => {
    const schedule = raw({
      ...prefs,
      schedule_from_hour: 8,
      schedule_from_min: 15,
      schedule_to_hour: 20,
      schedule_to_min: 45,
    });

    it('sends nothing when no time changed', () => {
      expect(toPreferenceChanges(schedule, fromPreferences(schedule), '2.16.0')).toEqual({});
    });

    it('sends hour and minute together when only the minute changed', () => {
      const draft = { ...fromPreferences(schedule), schedule_from_min: 30 };
      expect(toPreferenceChanges(schedule, draft, '2.16.0')).toEqual({
        schedule_from_hour: 8,
        schedule_from_min: 30,
      });
    });

    it('sends hour and minute together when only the hour changed', () => {
      const draft = { ...fromPreferences(schedule), schedule_to_hour: 22 };
      expect(toPreferenceChanges(schedule, draft, '2.16.0')).toEqual({
        schedule_to_hour: 22,
        schedule_to_min: 45,
      });
    });

    it('treats the from and to times independently', () => {
      const draft = { ...fromPreferences(schedule), schedule_from_hour: 9 };
      const changes = toPreferenceChanges(schedule, draft, '2.16.0');
      expect(changes).not.toHaveProperty('schedule_to_hour');
      expect(changes).not.toHaveProperty('schedule_to_min');

      const both = { ...draft, schedule_to_min: 0 };
      expect(toPreferenceChanges(schedule, both, '2.16.0')).toEqual({
        schedule_from_hour: 9,
        schedule_from_min: 15,
        schedule_to_hour: 20,
        schedule_to_min: 0,
      });
    });

    it('skips a pair whose keys are missing from the response', () => {
      const partial = raw({ schedule_from_hour: 8, schedule_to_hour: 20, schedule_to_min: 0 });
      const draft = fromPreferences(partial);
      expect(draft).not.toHaveProperty('schedule_from_hour');
      expect(draft.schedule_to_hour).toBe(20);
      const edited = { ...draft, schedule_from_hour: 9, schedule_from_min: 5 };
      expect(toPreferenceChanges(partial, edited, '2.16.0')).toEqual({});
    });
  });
});

describe('advanced fields', () => {
  const advancedPrefs = raw({
    disk_queue_size: 1024 * 1024,
    socket_send_buffer_size: 0,
    torrent_file_size_limit: 100 * 1048576,
    send_buffer_watermark: 500,
    current_network_interface: '',
    current_interface_address: '',
  });

  it('shows KiB and MiB values scaled down from the wire', () => {
    const draft = fromPreferences(advancedPrefs);
    expect(draft.disk_queue_size).toBe(1024);
    expect(draft.torrent_file_size_limit).toBe(100);
    expect(draft.send_buffer_watermark).toBe(500);
  });

  it('scales KiB and MiB fields back up, but not the send buffer watermark', () => {
    const draft = {
      ...fromPreferences(advancedPrefs),
      disk_queue_size: 2048,
      socket_send_buffer_size: 64,
      torrent_file_size_limit: 50,
      send_buffer_watermark: 600,
    };
    expect(toPreferenceChanges(advancedPrefs, draft, '2.16.0')).toEqual({
      disk_queue_size: 2048 * 1024,
      socket_send_buffer_size: 64 * 1024,
      torrent_file_size_limit: 50 * 1048576,
      send_buffer_watermark: 600,
    });
  });

  it('sends the bind address on its own when only the address changes', () => {
    const draft = { ...fromPreferences(advancedPrefs), current_interface_address: '10.2.0.2' };
    expect(toPreferenceChanges(advancedPrefs, draft, '2.16.0')).toEqual({
      current_interface_address: '10.2.0.2',
    });
  });

  it('sends the interface and its address together when both change', () => {
    const draft = {
      ...fromPreferences(advancedPrefs),
      current_network_interface: 'wg0',
      current_interface_address: '10.2.0.2',
    };
    expect(toPreferenceChanges(advancedPrefs, draft, '2.16.0')).toEqual({
      current_network_interface: 'wg0',
      current_interface_address: '10.2.0.2',
    });
  });
});

describe('renderedSections', () => {
  it('renders a field only when its key is in the response', () => {
    const sparse = raw({ dht: true, listen_port: 1 });
    const keys = fieldKeys(renderedSections(sparse, fromPreferences(sparse)));
    expect(keys).toContain('dht');
    expect(keys).toContain('listen_port');
    expect(keys).not.toContain('save_path');
    expect(keys).not.toContain('pex');
  });

  it('drops groups and sections left with no fields', () => {
    const sections = renderedSections(raw({ dht: true }), { dht: true });
    expect(sections.map((s) => s.id)).toEqual(['bittorrent']);
    expect(sections[0]!.groups).toHaveLength(1);
  });

  it('appends unrecognized keys to Advanced under Other (unrecognized)', () => {
    const withUnknown = raw({ dht: true, brand_new: 7 });
    const sections = renderedSections(withUnknown, fromPreferences(withUnknown));
    const advanced = sections.find((s) => s.id === 'advanced')!;
    const other = advanced.groups.at(-1)!;
    expect(other.title).toBe('Other (unrecognized)');
    expect(other.fields.map((f) => f.key)).toEqual(['brand_new']);
  });

  it('has no Other group when every key is recognized', () => {
    const sections = renderedSections(prefs, fromPreferences(prefs));
    expect(sections.find((s) => s.id === 'advanced')).toBeUndefined();
  });

  it('does not list known-but-unscheduled or not-rendered keys as unrecognized', () => {
    expect(unrecognizedFields(raw({ locale: 'en', scan_dirs: {}, max_ratio: 1 }))).toEqual([]);
  });
});

describe('unrecognizedFields', () => {
  it('picks an editor by the typeof the value, sorted by key', () => {
    const fields = unrecognizedFields(
      raw({
        z_text: 'a',
        b_flag: true,
        c_int: 3,
        d_float: 0.5,
        e_map: { a: 1 },
        f_list: [1],
        g_null: null,
      }),
    );
    expect(fields.map((f) => [f.key, f.kind])).toEqual([
      ['b_flag', 'bool'],
      ['c_int', 'int'],
      ['d_float', 'float'],
      ['e_map', 'json'],
      ['f_list', 'json'],
      ['g_null', 'json'],
      ['z_text', 'text'],
    ]);
  });

  it('shows objects read-only', () => {
    const [field] = unrecognizedFields(raw({ e_map: { a: 1 } }));
    expect(field!.readonly).toBe(true);
  });
});

describe('unappliedKeys', () => {
  it('lists sent keys whose value did not stick', () => {
    expect(
      unappliedKeys(
        raw({ listen_port: 99999, dht: false }),
        raw({ listen_port: 6881, dht: false }),
      ),
    ).toEqual(['listen_port']);
  });

  it('is empty when everything was applied, including deep-equal objects', () => {
    expect(
      unappliedKeys(raw({ dht: false, m: { a: [1] } }), raw({ dht: false, m: { a: [1] } })),
    ).toEqual([]);
  });

  it('ignores sent keys the server no longer reports', () => {
    expect(unappliedKeys(raw({ gone: 1 }), raw({ dht: true }))).toEqual([]);
  });
});

const schemaField = (key: string): SettingField =>
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).find((f) => f.key === key)!;

describe('isEnabledBySettings', () => {
  it('is always enabled for a field without a parent toggle', () => {
    expect(isEnabledBySettings(schemaField('dht'), {})).toBe(true);
  });

  it('follows its direct parent toggle', () => {
    const field = schemaField('file_log_path');
    expect(isEnabledBySettings(field, { file_log_enabled: true })).toBe(true);
    expect(isEnabledBySettings(field, { file_log_enabled: false })).toBe(false);
    expect(isEnabledBySettings(field, {})).toBe(false);
  });

  it('is disabled when a grandparent is off even though the direct toggle is on', () => {
    const password = schemaField('mail_notification_password');
    expect(
      isEnabledBySettings(password, {
        mail_notification_enabled: false,
        mail_notification_auth_enabled: true,
      }),
    ).toBe(false);
    expect(
      isEnabledBySettings(password, {
        mail_notification_enabled: true,
        mail_notification_auth_enabled: false,
      }),
    ).toBe(false);
    expect(
      isEnabledBySettings(password, {
        mail_notification_enabled: true,
        mail_notification_auth_enabled: true,
      }),
    ).toBe(true);
  });
});

describe('settingLabel', () => {
  it('labels an inline toggle key with its toggle label', () => {
    expect(settingLabel('file_log_backup_enabled')).toBe('Back up the log file');
  });

  it('labels a unit select key with its field label', () => {
    expect(settingLabel('file_log_age_type')).toBe(schemaField('file_log_age').label);
  });

  it('labels a time field minute key with the field label', () => {
    expect(settingLabel('schedule_from_min')).toBe(settingLabel('schedule_from_hour'));
    expect(settingLabel('schedule_from_min')).not.toBe('schedule_from_min');
  });

  it('labels the network interface address key with its address label', () => {
    expect(settingLabel('current_interface_address')).toBe('Optional IP address to bind to');
  });

  it('falls back to the raw key', () => {
    expect(settingLabel('nope_not_a_key')).toBe('nope_not_a_key');
  });
});

describe('behavior and downloads keys', () => {
  const logPrefs = raw({
    file_log_enabled: true,
    file_log_age: 1,
    file_log_age_type: 0,
    file_log_delete_old: true,
    scan_dirs: { '/watch': 0, '/other': '/custom' },
    torrent_changed_tmm_enabled: true,
  });

  it('sends only a changed unit select key', () => {
    const draft = { ...fromPreferences(logPrefs), file_log_age_type: 2 };
    expect(toPreferenceChanges(logPrefs, draft, '2.16.0')).toEqual({ file_log_age_type: 2 });
  });

  it('does not send scan_dirs when an equal copy is unchanged', () => {
    const draft = fromPreferences(logPrefs);
    draft.scan_dirs = { '/other': '/custom', '/watch': 0 };
    expect(toPreferenceChanges(logPrefs, draft, '2.16.0')).toEqual({});
  });

  it('sends the whole scan_dirs dict when an entry is added', () => {
    const draft = fromPreferences(logPrefs);
    draft.scan_dirs = { ...(draft.scan_dirs as object), '/new': 1 };
    expect(toPreferenceChanges(logPrefs, draft, '2.16.0')).toEqual({
      scan_dirs: { '/watch': 0, '/other': '/custom', '/new': 1 },
    });
  });

  it('sends the whole scan_dirs dict when an entry is removed', () => {
    const draft = fromPreferences(logPrefs);
    draft.scan_dirs = { '/watch': 0 };
    expect(toPreferenceChanges(logPrefs, draft, '2.16.0')).toEqual({ scan_dirs: { '/watch': 0 } });
  });

  it('does not let a draft edit reach the loaded scan_dirs', () => {
    const draft = fromPreferences(logPrefs);
    expect(draft.scan_dirs).not.toBe(logPrefs.scan_dirs);
  });

  it('round-trips a boolean select value as a boolean', () => {
    const draft = fromPreferences(logPrefs);
    expect(draft.torrent_changed_tmm_enabled).toBe(true);
    draft.torrent_changed_tmm_enabled = false;
    expect(toPreferenceChanges(logPrefs, draft, '2.16.0')).toEqual({
      torrent_changed_tmm_enabled: false,
    });
  });
});

describe('Web UI password', () => {
  const webUi = raw({ web_ui_username: 'admin', web_ui_port: 8080 });
  const draftWith = (extra: Record<string, unknown>) => ({ ...fromPreferences(webUi), ...extra });

  it('starts with empty password and confirmation when the username is present', () => {
    const draft = fromPreferences(webUi);
    expect(draft.web_ui_password).toBe('');
    expect(draft.web_ui_password_confirm).toBe('');
  });

  it('has no password fields when qBittorrent sends no username', () => {
    const draft = fromPreferences(raw({ dht: true }));
    expect(draft).not.toHaveProperty('web_ui_password');
    expect(draft).not.toHaveProperty('web_ui_password_confirm');
  });

  it('sends nothing for an untouched or empty password', () => {
    expect(toPreferenceChanges(webUi, fromPreferences(webUi), '2.16.0')).toEqual({});
  });

  it('sends the new password but never the confirmation', () => {
    const changes = toPreferenceChanges(
      webUi,
      draftWith({ web_ui_password: 'secret1', web_ui_password_confirm: 'secret1' }),
      '2.16.0',
    );
    expect(changes).toEqual({ web_ui_password: 'secret1' });
    expect(changes).not.toHaveProperty('web_ui_password_confirm');
  });

  describe('problems', () => {
    it('are empty when both fields are empty', () => {
      expect(draftProblems(fromPreferences(webUi))).toEqual([]);
    });

    it('flags a password shorter than six characters', () => {
      const problems = draftProblems(
        draftWith({ web_ui_password: 'abc', web_ui_password_confirm: 'abc' }),
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('6');
    });

    it('flags a mismatching confirmation', () => {
      const problems = draftProblems(
        draftWith({ web_ui_password: 'secret1', web_ui_password_confirm: 'secret2' }),
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/match/);
    });

    it('flags a password with an empty confirmation', () => {
      expect(
        draftProblems(draftWith({ web_ui_password: 'secret1', web_ui_password_confirm: '' })),
      ).toHaveLength(1);
    });

    it('accepts a matching password of six characters', () => {
      expect(
        draftProblems(draftWith({ web_ui_password: 'sixsix', web_ui_password_confirm: 'sixsix' })),
      ).toEqual([]);
    });

    it('flags a username shorter than three characters, as qBittorrent rejects it', () => {
      const problems = draftProblems(draftWith({ web_ui_username: 'ab' }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('3');
    });

    it('flags a username containing a colon, as qBittorrent rejects it', () => {
      const problems = draftProblems(draftWith({ web_ui_username: 'ad:min' }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/colon/);
    });

    it('accepts a username of three characters', () => {
      expect(draftProblems(draftWith({ web_ui_username: 'bob' }))).toEqual([]);
    });
  });

  it('sends a changed username alongside a new password', () => {
    expect(
      toPreferenceChanges(
        webUi,
        draftWith({
          web_ui_username: 'bob',
          web_ui_password: 'secret1',
          web_ui_password_confirm: 'secret1',
        }),
        '2.16.0',
      ),
    ).toEqual({ web_ui_username: 'bob', web_ui_password: 'secret1' });
  });

  it('marks the Web UI section as having problems for an invalid username', () => {
    expect(sectionsWithProblems(draftWith({ web_ui_username: 'ab' }))).toEqual(new Set(['webui']));
  });
});

describe('presenceKey gating', () => {
  it('renders the password field when web_ui_username is present, not web_ui_password', () => {
    const present = raw({ web_ui_username: 'admin' });
    expect(fieldKeys(renderedSections(present, fromPreferences(present)))).toContain(
      'web_ui_password',
    );
    const absent = raw({ web_ui_password: 'x' });
    expect(fieldKeys(renderedSections(absent, fromPreferences(absent)))).not.toContain(
      'web_ui_password',
    );
  });
});

describe('read-only API key', () => {
  it('renders but is never sent, even when the draft differs', () => {
    const original = raw({ web_ui_api_key: 'abc', web_ui_username: 'admin' });
    expect(fieldKeys(renderedSections(original, fromPreferences(original)))).toContain(
      'web_ui_api_key',
    );
    const draft = { ...fromPreferences(original), web_ui_api_key: 'changed' };
    expect(toPreferenceChanges(original, draft, '2.16.0')).toEqual({});
  });
});

describe('dangerousChanges', () => {
  it('is empty for harmless changes', () => {
    expect(dangerousChanges({ dht: true, web_ui_session_timeout: 10 })).toEqual([]);
  });

  it('groups changed keys by danger kind with their labels', () => {
    const result = dangerousChanges({
      web_ui_port: 9090,
      use_https: true,
      web_ui_username: 'bob',
      web_ui_csrf_protection_enabled: false,
    });
    expect(result).toEqual([
      { kind: 'reconnect', labels: [settingLabel('web_ui_port'), settingLabel('use_https')] },
      { kind: 'auth', labels: [settingLabel('web_ui_username')] },
      { kind: 'access', labels: [settingLabel('web_ui_csrf_protection_enabled')] },
    ]);
  });

  it('counts the alternative Web UI only when it is turned off', () => {
    expect(dangerousChanges({ alternative_webui_enabled: true })).toEqual([]);
    expect(dangerousChanges({ alternative_webui_enabled: false })).toEqual([
      { kind: 'lockout', labels: [settingLabel('alternative_webui_enabled')] },
    ]);
  });

  it('treats a changed alternative Web UI path as a lockout risk', () => {
    expect(dangerousChanges({ alternative_webui_path: '/ui' })).toEqual([
      { kind: 'lockout', labels: [settingLabel('alternative_webui_path')] },
    ]);
  });

  it('flags a changed password as an authentication risk', () => {
    expect(dangerousChanges({ web_ui_password: 'secret1' })).toEqual([
      { kind: 'auth', labels: [settingLabel('web_ui_password')] },
    ]);
  });

  it('uses the inline toggle label for a toggle key', () => {
    expect(dangerousChanges({ bypass_auth_subnet_whitelist_enabled: true })).toEqual([
      { kind: 'auth', labels: ['Bypass authentication for whitelisted subnets'] },
    ]);
  });
});

describe('sectionOfKey', () => {
  it('maps a field key to its section', () => {
    expect(sectionOfKey('dl_limit')).toBe('speed');
    expect(sectionOfKey('dht')).toBe('bittorrent');
    expect(sectionOfKey('web_ui_port')).toBe('webui');
  });

  it('maps companion keys to the section of the field that owns them', () => {
    expect(sectionOfKey('max_ratio_enabled')).toBe('bittorrent');
    expect(sectionOfKey('file_log_backup_enabled')).toBe('behavior');
    expect(sectionOfKey('file_log_age_type')).toBe('behavior');
  });

  it('files keys the schema does not know under advanced', () => {
    expect(sectionOfKey('brand_new_limit')).toBe('advanced');
  });
});

describe('sectionsWithChanges', () => {
  it('is empty without changes', () => {
    expect(sectionsWithChanges({})).toEqual(new Set());
  });

  it('collects each changed section once, including unknown keys', () => {
    const changes = raw({ dl_limit: 1, up_limit: 2, dht: false, brand_new_limit: 9 });
    expect(sectionsWithChanges(changes)).toEqual(new Set(['speed', 'bittorrent', 'advanced']));
  });
});

describe('sectionsWithProblems', () => {
  const webUi = raw({ web_ui_username: 'admin' });

  it('is empty for a clean draft', () => {
    expect(sectionsWithProblems(fromPreferences(webUi))).toEqual(new Set());
  });

  it('names the section of a composite with a problem', () => {
    const draft = {
      ...fromPreferences(webUi),
      web_ui_password: 'secret1',
      web_ui_password_confirm: 'secret2',
    };
    expect(sectionsWithProblems(draft)).toEqual(new Set(['webui']));
  });
});
