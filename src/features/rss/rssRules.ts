import { ContentLayout } from '@/constants/qbit';
import type { RawRssRule, RawRssTorrentParams } from '@/types/qbit';

export type AddStoppedChoice = 'default' | 'always' | 'never';

export interface RssRuleForm {
  useRegex: boolean;
  mustContain: string;
  mustNotContain: string;
  episodeFilter: string;
  smartFilter: boolean;
  ignoreDays: number;
  affectedFeeds: string[];
  category: string;
  tags: string;
  saveToDifferentDirectory: boolean;
  savePath: string;
  addStopped: AddStoppedChoice;
  contentLayout: '' | ContentLayout;
}

const CONTENT_LAYOUTS = new Set<string>(Object.values(ContentLayout));

export function ruleToForm(rule: RawRssRule): RssRuleForm {
  const params = rule.torrentParams ?? {};
  const savePath = params.save_path ?? '';
  return {
    useRegex: !!rule.useRegex,
    mustContain: rule.mustContain ?? '',
    mustNotContain: rule.mustNotContain ?? '',
    episodeFilter: rule.episodeFilter ?? '',
    smartFilter: !!rule.smartFilter,
    ignoreDays: rule.ignoreDays ?? 0,
    affectedFeeds: [...(rule.affectedFeeds ?? [])],
    category: params.category ?? '',
    tags: (params.tags ?? []).join(', '),
    saveToDifferentDirectory: savePath !== '',
    savePath,
    addStopped: params.stopped == null ? 'default' : params.stopped ? 'always' : 'never',
    contentLayout:
      params.content_layout && CONTENT_LAYOUTS.has(params.content_layout)
        ? (params.content_layout as ContentLayout)
        : '',
  };
}

export function splitRuleTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

// setRule replaces the whole rule: keys the form doesn't edit must be carried over or they're lost.
export function formToRule(base: RawRssRule, form: RssRuleForm): RawRssRule {
  const { use_auto_tmm: previousAutoTmm, ...baseParams } = base.torrentParams ?? {};
  const torrentParams: RawRssTorrentParams = {
    ...baseParams,
    category: form.category,
    tags: splitRuleTags(form.tags),
    save_path: form.saveToDifferentDirectory ? form.savePath.trim() : '',
    stopped: form.addStopped === 'default' ? null : form.addStopped === 'always',
    content_layout: form.contentLayout || null,
  };
  if (form.saveToDifferentDirectory) torrentParams.use_auto_tmm = false;
  else if (previousAutoTmm !== false) torrentParams.use_auto_tmm = previousAutoTmm;
  return {
    ...base,
    useRegex: form.useRegex,
    mustContain: form.mustContain,
    mustNotContain: form.mustNotContain,
    episodeFilter: form.episodeFilter.trim(),
    smartFilter: form.smartFilter,
    ignoreDays: Math.max(0, Math.floor(form.ignoreDays) || 0),
    affectedFeeds: form.affectedFeeds,
    torrentParams,
  };
}

export function cloneRuleForm(form: RssRuleForm): RssRuleForm {
  return { ...form, affectedFeeds: [...form.affectedFeeds] };
}

function comparableRuleForm(form: RssRuleForm): string {
  return JSON.stringify({ ...form, affectedFeeds: [...form.affectedFeeds].sort() });
}

export function sameRuleForm(a: RssRuleForm, b: RssRuleForm): boolean {
  return comparableRuleForm(a) === comparableRuleForm(b);
}

const EPISODE_FILTER = /^\d{1,4}x(\d{1,4}(-(\d{1,4})?)?;)+$/i;

export function isValidEpisodeFilter(filter: string): boolean {
  const trimmed = filter.trim();
  return trimmed === '' || EPISODE_FILTER.test(trimmed);
}

export function regexProblem(expression: string): string | null {
  try {
    new RegExp(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function lastMatchLabel(lastMatch: string | undefined, nowMs = Date.now()): string {
  const ms = lastMatch ? Date.parse(lastMatch) : NaN;
  if (Number.isNaN(ms)) return 'Never matched';
  const days = Math.floor((nowMs - ms) / 86_400_000);
  if (days <= 0) return 'Last matched today';
  return days === 1 ? 'Last matched yesterday' : `Last matched ${days} days ago`;
}
