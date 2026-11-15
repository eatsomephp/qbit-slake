import {
  ACTIVITY_FILTERS,
  COMPLETION_FILTERS,
  CONDITION_FIELDS,
  FILTER_GROUP_KEYS,
  STATE_FILTERS,
  TRACKERLESS,
  UNCATEGORIZED,
  UNTAGGED,
  clearValue,
  conditionsEqual,
  emptyFilters,
  markOf,
  normalizePath,
  type ActivityFilter,
  type CompletionFilter,
  type Condition,
  type ConditionField,
  type ConditionOperator,
  type FilterGroupKey,
  type TorrentFilters,
} from './torrentFilters';

export type NamedGroupKey = Exclude<FilterGroupKey, 'state'>;
export type QueryVocabulary = Partial<Record<NamedGroupKey, readonly string[]>>;

export interface QueryToken {
  text: string;
  start: number;
  end: number;
}

export type ParsedToken =
  | { kind: 'text'; text: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'group'; group: FilterGroupKey; value: string; isExcluded: boolean }
  | { kind: 'activity'; value: ActivityFilter }
  | { kind: 'completion'; value: CompletionFilter }
  | { kind: 'condition'; condition: Condition };

type FilterKey =
  | { kind: 'group'; group: FilterGroupKey }
  | { kind: 'activity' }
  | { kind: 'completion' }
  | { kind: 'is' };

const FILTER_KEYS: Record<string, FilterKey> = {
  state: { kind: 'group', group: 'state' },
  status: { kind: 'group', group: 'state' },
  is: { kind: 'is' },
  activity: { kind: 'activity' },
  completion: { kind: 'completion' },
  cat: { kind: 'group', group: 'category' },
  category: { kind: 'group', group: 'category' },
  tag: { kind: 'group', group: 'tag' },
  tracker: { kind: 'group', group: 'tracker' },
  path: { kind: 'group', group: 'location' },
  location: { kind: 'group', group: 'location' },
};

const CANONICAL_KEYS: Record<FilterGroupKey, string> = {
  state: 'state',
  category: 'cat',
  tag: 'tag',
  tracker: 'tracker',
  location: 'path',
};

const SYNTHETIC_NAMES: Partial<Record<FilterGroupKey, string>> = {
  category: 'uncategorized',
  tag: 'untagged',
  tracker: 'trackerless',
};

const SYNTHETIC_VALUES: Partial<Record<FilterGroupKey, string>> = {
  category: UNCATEGORIZED,
  tag: UNTAGGED,
  tracker: TRACKERLESS,
};

const TOKEN_PATTERN = /^(-?)([a-z]+)(:|>=|<=|>|<|=)(.*)$/is;
const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const PLAIN_NUMBER_PATTERN = new RegExp(`^${NUMBER}$`);
const PERCENT_PATTERN = new RegExp(`^${NUMBER}%?$`);
const SIZE_PATTERN = new RegExp(`^${NUMBER}([kmgtp]?)(?:i?b)?$`, 'i');
const AGE_PATTERN = new RegExp(`^${NUMBER}(mo|min|y|w|d|h|m|s)?$`, 'i');

const SIZE_PREFIXES = ['', 'K', 'M', 'G', 'T', 'P'];
const DAY = 86_400;
const FORMATTED_AGE_UNITS: [string, number][] = [
  ['d', DAY],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];
const AGE_UNIT_SECONDS: Record<string, number> = {
  ...Object.fromEntries(FORMATTED_AGE_UNITS),
  y: 365 * DAY,
  mo: 30 * DAY,
  w: 7 * DAY,
  min: 60,
};

const OPERATOR_SYMBOLS: Record<ConditionOperator, string> = {
  '>': '>',
  '>=': '≥',
  '<': '<',
  '<=': '≤',
  '=': '=',
};

const CONDITION_LABELS: Record<ConditionField, string> = {
  ratio: 'Ratio',
  size: 'Size',
  progress: 'Progress',
  seeds: 'Seeds',
  peers: 'Peers',
  added: 'Added',
  completed: 'Completed',
};

const isFilterKey = (key: string) => Object.hasOwn(FILTER_KEYS, key);
const isActivity = (value: string): value is ActivityFilter =>
  (ACTIVITY_FILTERS as readonly string[]).includes(value);
const isCompletion = (value: string): value is CompletionFilter =>
  (COMPLETION_FILTERS as readonly string[]).includes(value);
const oppositeCompletion = (value: CompletionFilter): CompletionFilter =>
  value === 'complete' ? 'incomplete' : 'complete';
const isConditionField = (key: string): key is ConditionField =>
  (CONDITION_FIELDS as readonly string[]).includes(key);

export function tokenizeQuery(text: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i]!)) {
      i++;
      continue;
    }
    const start = i;
    let isInQuotes = false;
    while (i < text.length && (isInQuotes || !/\s/.test(text[i]!))) {
      if (isInQuotes && text[i] === '\\' && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (text[i] === '"') isInQuotes = !isInQuotes;
      i++;
    }
    tokens.push({ text: text.slice(start, i), start, end: i });
  }
  return tokens;
}

function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  const body = value.length > 1 && value.endsWith('"') ? value.slice(1, -1) : value.slice(1);
  return body.replace(/\\(.)/g, '$1');
}

export function quoteIfNeeded(value: string): string {
  if (value && !/[\s"]/.test(value)) return value;
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

function resolveEnum<T extends string>(value: string, options: readonly T[]): T | null {
  const lower = value.toLowerCase();
  const exact = options.find((option) => option === lower);
  if (exact) return exact;
  const byPrefix = options.filter((option) => option.startsWith(lower));
  return byPrefix.length === 1 ? byPrefix[0]! : null;
}

function resolveName(value: string, known: readonly string[] | undefined): string {
  if (!known || known.includes(value)) return value;
  const lower = value.toLowerCase();
  const caseInsensitive = known.filter((name) => name.toLowerCase() === lower);
  return caseInsensitive.length === 1 ? caseInsensitive[0]! : value;
}

const ENUM_KEY_OPTIONS: Record<Exclude<FilterKey['kind'], 'group'>, readonly string[]> = {
  is: [...STATE_FILTERS, ...ACTIVITY_FILTERS, ...COMPLETION_FILTERS],
  activity: ACTIVITY_FILTERS,
  completion: COMPLETION_FILTERS,
};

const listOf = (options: readonly string[]) => options.join(', ');

function parseFilterToken(
  key: FilterKey,
  rawValue: string,
  isExcluded: boolean,
  vocabulary: QueryVocabulary,
): ParsedToken {
  const value = unquote(rawValue);
  const isQuoted = rawValue.startsWith('"');
  if (!value && !isQuoted) return { kind: 'invalid', message: 'Enter a value after the colon' };

  if (key.kind !== 'group') {
    const options = ENUM_KEY_OPTIONS[key.kind];
    const resolved = resolveEnum(value, options);
    if (!resolved) {
      return { kind: 'invalid', message: `Unknown value “${value}”. Use ${listOf(options)}` };
    }
    if (isCompletion(resolved)) {
      return {
        kind: 'completion',
        value: isExcluded ? oppositeCompletion(resolved) : resolved,
      };
    }
    if (!isActivity(resolved)) {
      return { kind: 'group', group: 'state', value: resolved, isExcluded };
    }
    return isExcluded
      ? { kind: 'invalid', message: 'Activity can’t be excluded' }
      : { kind: 'activity', value: resolved };
  }

  const { group } = key;
  if (group === 'state') {
    const state = resolveEnum(value, STATE_FILTERS);
    return state
      ? { kind: 'group', group, value: state, isExcluded }
      : { kind: 'invalid', message: `Unknown state “${value}”. Use ${listOf(STATE_FILTERS)}` };
  }
  if (!value) {
    const synthetic = SYNTHETIC_VALUES[group];
    return synthetic === undefined
      ? { kind: 'invalid', message: 'Enter a path' }
      : { kind: 'group', group, value: synthetic, isExcluded };
  }
  const name = resolveName(value, vocabulary[group]);
  return {
    kind: 'group',
    group,
    value: group === 'location' ? normalizePath(name) : name,
    isExcluded,
  };
}

function parseConditionValue(field: ConditionField, raw: string): number | null {
  switch (field) {
    case 'size': {
      const match = SIZE_PATTERN.exec(raw);
      if (!match) return null;
      const power = SIZE_PREFIXES.indexOf(match[2]!.toUpperCase());
      return Math.round(Number(match[1]) * 1024 ** power);
    }
    case 'added':
    case 'completed': {
      const match = AGE_PATTERN.exec(raw);
      if (!match) return null;
      const unit = AGE_UNIT_SECONDS[(match[2] ?? 'd').toLowerCase()]!;
      return Math.round(Number(match[1]) * unit);
    }
    case 'progress': {
      const match = PERCENT_PATTERN.exec(raw);
      return match ? Number(match[1]) : null;
    }
    default: {
      const match = PLAIN_NUMBER_PATTERN.exec(raw);
      return match ? Number(match[1]) : null;
    }
  }
}

const CONDITION_HINTS: Record<ConditionField, string> = {
  ratio: 'a number, like ratio>2',
  size: 'a size, like size>10G',
  progress: 'a percentage, like progress<50%',
  seeds: 'a number, like seeds>5',
  peers: 'a number, like peers>5',
  added: 'an age, like added<7d',
  completed: 'an age, like completed>30d',
};

function parseConditionToken(
  field: ConditionField,
  operator: ConditionOperator,
  rawValue: string,
  isExcluded: boolean,
): ParsedToken {
  if (isExcluded) {
    return { kind: 'invalid', message: 'Comparisons can’t be excluded; flip the operator instead' };
  }
  const value = parseConditionValue(field, rawValue);
  if (value === null) return { kind: 'invalid', message: `Use ${CONDITION_HINTS[field]}` };
  return { kind: 'condition', condition: { field, operator, value } };
}

function plainText(text: string): ParsedToken {
  return { kind: 'text', text: text.startsWith('"') ? unquote(text) : text };
}

export function parseToken(text: string, vocabulary: QueryVocabulary = {}): ParsedToken {
  const match = TOKEN_PATTERN.exec(text);
  if (!match) return plainText(text);
  const [, minus, rawKey, operator, rawValue] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const key = rawKey.toLowerCase();
  const isExcluded = minus === '-';
  if (operator === ':' && isFilterKey(key)) {
    return parseFilterToken(FILTER_KEYS[key]!, rawValue, isExcluded, vocabulary);
  }
  if (operator !== ':' && isConditionField(key)) {
    return parseConditionToken(key, operator as ConditionOperator, rawValue, isExcluded);
  }
  return plainText(text);
}

type CommittableToken = Exclude<ParsedToken, { kind: 'text' | 'invalid' }>;

const isCommittable = (parsed: ParsedToken): parsed is CommittableToken =>
  parsed.kind !== 'text' && parsed.kind !== 'invalid';

export function applyToken(filters: TorrentFilters, token: CommittableToken): TorrentFilters {
  switch (token.kind) {
    case 'group': {
      const group = filters[token.group];
      const mark = token.isExcluded ? 'exclude' : 'include';
      if (markOf(group, token.value) === mark) return filters;
      const cleared = clearValue(group, token.value);
      cleared[mark].push(token.value);
      return { ...filters, [token.group]: cleared };
    }
    case 'activity':
      return { ...filters, activity: token.value };
    case 'completion':
      return { ...filters, completion: token.value };
    case 'condition':
      if (filters.conditions.some((c) => conditionsEqual(c, token.condition))) return filters;
      return { ...filters, conditions: [...filters.conditions, token.condition] };
  }
}

const isUnderCaret = (token: QueryToken, caret: number | null) =>
  caret !== null && caret >= token.start && caret <= token.end;

export interface CommitResult {
  text: string;
  filters: TorrentFilters;
  caret: number;
  hasCommitted: boolean;
}

export function commitQueryText(
  text: string,
  filters: TorrentFilters,
  vocabulary: QueryVocabulary,
  caret: number | null,
): CommitResult {
  let nextFilters = filters;
  const tokens = tokenizeQuery(text);
  const keptTokens: QueryToken[] = [];
  for (const token of tokens) {
    const parsed = isUnderCaret(token, caret) ? null : parseToken(token.text, vocabulary);
    if (parsed && isCommittable(parsed)) nextFilters = applyToken(nextFilters, parsed);
    else keptTokens.push(token);
  }
  const hasCommitted = keptTokens.length !== tokens.length;
  if (!hasCommitted) return { text, filters, caret: caret ?? text.length, hasCommitted };

  let rebuilt = '';
  let nextCaret: number | null = null;
  let endOfTokensBeforeCaret = 0;
  for (const token of keptTokens) {
    if (rebuilt) rebuilt += ' ';
    if (isUnderCaret(token, caret)) nextCaret = rebuilt.length + (caret! - token.start);
    rebuilt += token.text;
    if (caret !== null && token.end <= caret) endOfTokensBeforeCaret = rebuilt.length;
  }
  if (keptTokens.length && /\s$/.test(text)) rebuilt += ' ';
  if (nextCaret === null) {
    const hasGapAfter = endOfTokensBeforeCaret > 0 && endOfTokensBeforeCaret < rebuilt.length;
    nextCaret = caret === null ? rebuilt.length : endOfTokensBeforeCaret + (hasGapAfter ? 1 : 0);
  }
  return { text: rebuilt, filters: nextFilters, caret: nextCaret, hasCommitted };
}

export function freeSearchText(text: string): string {
  const words: string[] = [];
  for (const token of tokenizeQuery(text)) {
    const parsed = parseToken(token.text);
    if (parsed.kind === 'text') words.push(parsed.text);
  }
  return words.join(' ');
}

export function queryProblems(text: string, caret: number | null): string[] {
  const problems: string[] = [];
  for (const token of tokenizeQuery(text)) {
    if (isUnderCaret(token, caret)) continue;
    const parsed = parseToken(token.text);
    if (parsed.kind === 'invalid') problems.push(`${token.text}: ${parsed.message}`);
  }
  return problems;
}

export function parseQuery(
  text: string,
  vocabulary: QueryVocabulary = {},
): { filters: TorrentFilters; search: string } {
  const result = commitQueryText(text, emptyFilters(), vocabulary, null);
  return { filters: result.filters, search: result.text.trim() };
}

function formatSize(bytes: number): string {
  for (let power = SIZE_PREFIXES.length - 1; power > 0; power--) {
    const unit = 1024 ** power;
    const scaled = Number((bytes / unit).toFixed(3));
    if (scaled >= 1 && Math.round(scaled * unit) === bytes)
      return `${scaled}${SIZE_PREFIXES[power]}`;
  }
  return String(bytes);
}

function formatAge(seconds: number): string {
  for (const [unit, unitSeconds] of FORMATTED_AGE_UNITS) {
    if (seconds >= unitSeconds && seconds % unitSeconds === 0)
      return `${seconds / unitSeconds}${unit}`;
  }
  return `${seconds}s`;
}

function formatConditionValue({ field, value }: Condition): string {
  switch (field) {
    case 'size':
      return formatSize(value);
    case 'added':
    case 'completed':
      return formatAge(value);
    case 'progress':
      return `${value}%`;
    default:
      return String(value);
  }
}

export function conditionToken(condition: Condition): string {
  return `${condition.field}${condition.operator}${formatConditionValue(condition)}`;
}

function sizeLabel(bytes: number): string {
  const [, number, prefix] = /^([\d.]+)([KMGTP]?)$/.exec(formatSize(bytes))!;
  return `${number} ${prefix ? `${prefix}iB` : 'B'}`;
}

export function conditionLabel(condition: Condition): string {
  const symbol = OPERATOR_SYMBOLS[condition.operator];
  let value = formatConditionValue(condition);
  if (condition.field === 'size') value = sizeLabel(condition.value);
  if (condition.field === 'added' || condition.field === 'completed') value += ' ago';
  return `${CONDITION_LABELS[condition.field]} ${symbol} ${value}`;
}

export function groupToken(group: FilterGroupKey, value: string, isExcluded: boolean): string {
  return `${isExcluded ? '-' : ''}${CANONICAL_KEYS[group]}:${quoteIfNeeded(value)}`;
}

export function activityToken(activity: ActivityFilter): string {
  return `activity:${activity}`;
}

export function completionToken(completion: CompletionFilter): string {
  return `completion:${completion}`;
}

/** Must match the chip bar's order: popLastFilter pops what looks like the last chip. */
export function filterTokens(filters: TorrentFilters): string[] {
  const groupTokens = (group: FilterGroupKey) => [
    ...filters[group].include.map((value) => groupToken(group, value, false)),
    ...filters[group].exclude.map((value) => groupToken(group, value, true)),
  ];
  return [
    ...groupTokens('state'),
    ...(filters.activity ? [activityToken(filters.activity)] : []),
    ...(filters.completion ? [completionToken(filters.completion)] : []),
    ...FILTER_GROUP_KEYS.filter((group) => group !== 'state').flatMap(groupTokens),
    ...filters.conditions.map(conditionToken),
  ];
}

export function serializeQuery(filters: TorrentFilters, search: string): string {
  return [...filterTokens(filters), search.trim()].filter(Boolean).join(' ');
}

export function popLastFilter(
  filters: TorrentFilters,
): { filters: TorrentFilters; token: string } | null {
  const lastCondition = filters.conditions.at(-1);
  if (lastCondition) {
    return {
      filters: { ...filters, conditions: filters.conditions.slice(0, -1) },
      token: conditionToken(lastCondition),
    };
  }
  const groupsInChipOrder: FilterGroupKey[] = ['state', 'category', 'tag', 'tracker', 'location'];
  for (const group of groupsInChipOrder.toReversed()) {
    if (group === 'state' && filters.completion) {
      return {
        filters: { ...filters, completion: null },
        token: completionToken(filters.completion),
      };
    }
    if (group === 'state' && filters.activity) {
      return { filters: { ...filters, activity: null }, token: activityToken(filters.activity) };
    }
    const { include, exclude } = filters[group];
    const isExcluded = exclude.length > 0;
    const value = isExcluded ? exclude.at(-1) : include.at(-1);
    if (value === undefined) continue;
    return {
      filters: { ...filters, [group]: clearValue(filters[group], value) },
      token: groupToken(group, value, isExcluded),
    };
  }
  return null;
}

export type SuggestionTarget =
  | { kind: 'group'; group: FilterGroupKey; value: string }
  | { kind: 'activity'; value: ActivityFilter }
  | { kind: 'completion'; value: CompletionFilter };

export interface QuerySuggestion {
  target: SuggestionTarget;
  replacement: string;
}

export interface SuggestionContext {
  key: FilterKey;
  isExcluded: boolean;
  partial: string;
  start: number;
  end: number;
}

export function suggestionContext(text: string, caret: number): SuggestionContext | null {
  const token = tokenizeQuery(text).find((t) => t.end === caret);
  if (!token) return null;
  const match = /^(-?)([a-z]+):(.*)$/is.exec(token.text);
  if (!match || !isFilterKey(match[2]!.toLowerCase())) return null;
  return {
    key: FILTER_KEYS[match[2]!.toLowerCase()]!,
    isExcluded: match[1] === '-',
    partial: unquote(match[3]!).toLowerCase(),
    start: token.start,
    end: token.end,
  };
}

function candidatesFor(key: FilterKey, isExcluded: boolean, vocabulary: QueryVocabulary) {
  const states = STATE_FILTERS.map((value): SuggestionTarget => ({
    kind: 'group',
    group: 'state',
    value,
  }));
  const activities = isExcluded
    ? []
    : ACTIVITY_FILTERS.map((value): SuggestionTarget => ({ kind: 'activity', value }));
  const completions = isExcluded
    ? []
    : COMPLETION_FILTERS.map((value): SuggestionTarget => ({ kind: 'completion', value }));
  if (key.kind === 'is') return [...states, ...activities, ...completions];
  if (key.kind === 'activity') return activities;
  if (key.kind === 'completion') return completions;
  if (key.group === 'state') return states;
  const named = (vocabulary[key.group] ?? []).map((value): SuggestionTarget => ({
    kind: 'group',
    group: key.group,
    value,
  }));
  const synthetic = SYNTHETIC_VALUES[key.group];
  return synthetic === undefined
    ? named
    : [{ kind: 'group', group: key.group, value: synthetic } as SuggestionTarget, ...named];
}

function suggestionReplacement(target: SuggestionTarget, isExcluded: boolean): string {
  switch (target.kind) {
    case 'activity':
      return activityToken(target.value);
    case 'completion':
      return completionToken(target.value);
    case 'group':
      return groupToken(target.group, target.value, isExcluded);
  }
}

function searchableName(target: SuggestionTarget): string {
  if (target.kind === 'group' && target.value === '') return SYNTHETIC_NAMES[target.group] ?? '';
  return target.value.toLowerCase();
}

function isAlreadyApplied(target: SuggestionTarget, isExcluded: boolean, filters: TorrentFilters) {
  if (target.kind === 'activity') return filters.activity === target.value;
  if (target.kind === 'completion') return filters.completion === target.value;
  return markOf(filters[target.group], target.value) === (isExcluded ? 'exclude' : 'include');
}

export function suggestValues(
  context: SuggestionContext,
  vocabulary: QueryVocabulary,
  filters: TorrentFilters,
  limit = 8,
): QuerySuggestion[] {
  const prefixMatches: SuggestionTarget[] = [];
  const otherMatches: SuggestionTarget[] = [];
  for (const target of candidatesFor(context.key, context.isExcluded, vocabulary)) {
    if (isAlreadyApplied(target, context.isExcluded, filters)) continue;
    const name = searchableName(target);
    if (name.startsWith(context.partial)) prefixMatches.push(target);
    else if (name.includes(context.partial)) otherMatches.push(target);
  }
  return [...prefixMatches, ...otherMatches].slice(0, limit).map((target) => ({
    target,
    replacement: suggestionReplacement(target, context.isExcluded),
  }));
}
