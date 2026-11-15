import { API, ShareLimitAction } from '@/constants/qbit';
import { apiAtLeast, normalizeShareLimitAction } from '@/sync/normalize';
import type { RawPreferences } from '@/types/qbit';
import type { CompositeEncoder, Draft } from './types';

const LIMIT_PAIRS = [
  { value: 'max_ratio', flag: 'max_ratio_enabled', valueWhenOff: 1 },
  { value: 'max_seeding_time', flag: 'max_seeding_time_enabled', valueWhenOff: 1440 },
  {
    value: 'max_inactive_seeding_time',
    flag: 'max_inactive_seeding_time_enabled',
    valueWhenOff: 1440,
  },
] as const;

const SHARE_ACTION_NUMBER: Record<ShareLimitAction, number> = {
  [ShareLimitAction.Default]: 0,
  [ShareLimitAction.Stop]: 0,
  [ShareLimitAction.Remove]: 1,
  [ShareLimitAction.EnableSuperSeeding]: 2,
  [ShareLimitAction.RemoveWithContent]: 3,
};

function shareLimitsDraft(prefs: RawPreferences): Draft {
  const draft: Draft = {};
  for (const pair of LIMIT_PAIRS) {
    if (!(pair.value in prefs)) continue;
    const value = prefs[pair.value] as number;
    draft[pair.flag] = (prefs[pair.flag] as boolean | undefined) ?? value >= 0;
    draft[pair.value] = value >= 0 ? value : pair.valueWhenOff;
  }
  const action = normalizeShareLimitAction(prefs.max_ratio_act);
  draft.max_ratio_act = action === ShareLimitAction.Default ? ShareLimitAction.Stop : action;
  return draft;
}

export const shareLimits: CompositeEncoder = {
  keys: [...LIMIT_PAIRS.flatMap((pair) => [pair.value, pair.flag]), 'max_ratio_act'],
  toDraft: shareLimitsDraft,
  toChanges(original, draft, apiVersion) {
    const before = shareLimitsDraft(original);
    const out: Partial<RawPreferences> = {};
    // From WebAPI 2.11.6 setPreferences rejects a pair carrying both the flag and the
    // value, so send only the value (-1 disables). Older servers need both.
    const valueOnly = apiAtLeast(apiVersion, API.prefsLimitPairs);
    for (const pair of LIMIT_PAIRS) {
      if (!(pair.value in original)) continue;
      const enabled = draft[pair.flag] as boolean;
      const flagChanged = enabled !== before[pair.flag];
      if (!flagChanged && !(enabled && draft[pair.value] !== before[pair.value])) continue;
      out[pair.value] = enabled ? (draft[pair.value] as number) : -1;
      if (!valueOnly) {
        out[pair.flag] = enabled;
        if (!enabled) out[pair.value] = before[pair.value] as number;
      }
    }
    const action = draft.max_ratio_act as ShareLimitAction;
    if (action !== before.max_ratio_act) {
      out.max_ratio_act =
        typeof original.max_ratio_act === 'number' ? SHARE_ACTION_NUMBER[action] : action;
    }
    return out;
  },
};

const SCHEDULE_TIMES = [
  { hour: 'schedule_from_hour', minute: 'schedule_from_min' },
  { hour: 'schedule_to_hour', minute: 'schedule_to_min' },
] as const;

function scheduleTimesDraft(prefs: RawPreferences): Draft {
  const draft: Draft = {};
  for (const time of SCHEDULE_TIMES) {
    if (!(time.hour in prefs) || !(time.minute in prefs)) continue;
    draft[time.hour] = prefs[time.hour];
    draft[time.minute] = prefs[time.minute];
  }
  return draft;
}

export const scheduleTimes: CompositeEncoder = {
  keys: SCHEDULE_TIMES.flatMap((time) => [time.hour, time.minute]),
  toDraft: scheduleTimesDraft,
  toChanges(original, draft) {
    const out: Partial<RawPreferences> = {};
    // qBittorrent only applies a scheduler time when its hour and minute arrive together.
    for (const time of SCHEDULE_TIMES) {
      if (!(time.hour in original) || !(time.minute in original)) continue;
      if (draft[time.hour] === original[time.hour] && draft[time.minute] === original[time.minute])
        continue;
      out[time.hour] = draft[time.hour] as number;
      out[time.minute] = draft[time.minute] as number;
    }
    return out;
  },
};

export const WEB_UI_USERNAME_MIN_LENGTH = 3;
export const WEB_UI_PASSWORD_MIN_LENGTH = 6;

function webUiUsernameProblems(draft: Draft): string[] {
  if (typeof draft.web_ui_username !== 'string') return [];
  if (draft.web_ui_username.length < WEB_UI_USERNAME_MIN_LENGTH)
    return [`The Web UI username needs at least ${WEB_UI_USERNAME_MIN_LENGTH} characters.`];
  return draft.web_ui_username.includes(':') ? ["The Web UI username can't contain a colon."] : [];
}

function webUiPasswordProblems(draft: Draft): string[] {
  const password = String(draft.web_ui_password ?? '');
  const confirmation = String(draft.web_ui_password_confirm ?? '');
  if (password === '' && confirmation === '') return [];
  if (password.length < WEB_UI_PASSWORD_MIN_LENGTH)
    return [`The Web UI password needs at least ${WEB_UI_PASSWORD_MIN_LENGTH} characters.`];
  return password === confirmation ? [] : ["The Web UI passwords don't match."];
}

export const webUiCredentials: CompositeEncoder = {
  keys: ['web_ui_username', 'web_ui_password', 'web_ui_password_confirm'],
  toDraft: (prefs) =>
    'web_ui_username' in prefs
      ? { web_ui_username: prefs.web_ui_username, web_ui_password: '', web_ui_password_confirm: '' }
      : {},
  toChanges(original, draft) {
    const out: Partial<RawPreferences> = {};
    if ('web_ui_username' in original && draft.web_ui_username !== original.web_ui_username)
      out.web_ui_username = draft.web_ui_username as string;
    // GET never returns the password, so an empty input means "keep the current one".
    const password = draft.web_ui_password;
    if (typeof password === 'string' && password !== '') out.web_ui_password = password;
    return out;
  },
  // qBittorrent rejects these with a 400 after applying the keys it already processed.
  problems: (draft) => [...webUiUsernameProblems(draft), ...webUiPasswordProblems(draft)],
};

export const COMPOSITES: readonly CompositeEncoder[] = [
  shareLimits,
  scheduleTimes,
  webUiCredentials,
];
