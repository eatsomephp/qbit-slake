import { describe, expect, it } from 'vitest';
import { ContentLayout } from '@/constants/qbit';
import type { RawRssRule } from '@/types/qbit';
import {
  cloneRuleForm,
  formToRule,
  isValidEpisodeFilter,
  lastMatchLabel,
  regexProblem,
  ruleToForm,
  sameRuleForm,
  splitRuleTags,
} from './rssRules';

describe('ruleToForm', () => {
  it('uses defaults for an empty rule', () => {
    expect(ruleToForm({})).toEqual({
      useRegex: false,
      mustContain: '',
      mustNotContain: '',
      episodeFilter: '',
      smartFilter: false,
      ignoreDays: 0,
      affectedFeeds: [],
      category: '',
      tags: '',
      saveToDifferentDirectory: false,
      savePath: '',
      addStopped: 'default',
      contentLayout: '',
    });
  });

  it('maps torrent params into form fields', () => {
    const form = ruleToForm({
      torrentParams: {
        category: 'tv',
        tags: ['a', 'b'],
        save_path: '/dl',
        stopped: false,
        content_layout: ContentLayout.Subfolder,
      },
    });
    expect(form).toMatchObject({
      category: 'tv',
      tags: 'a, b',
      saveToDifferentDirectory: true,
      savePath: '/dl',
      addStopped: 'never',
      contentLayout: ContentLayout.Subfolder,
    });
    expect(ruleToForm({ torrentParams: { stopped: true } }).addStopped).toBe('always');
    expect(ruleToForm({ torrentParams: { stopped: null } }).addStopped).toBe('default');
  });

  it('drops unknown content layouts and copies the feeds array', () => {
    const feeds = ['x'];
    const form = ruleToForm({ affectedFeeds: feeds, torrentParams: { content_layout: 'Weird' } });
    expect(form.contentLayout).toBe('');
    expect(form.affectedFeeds).not.toBe(feeds);
  });
});

describe('splitRuleTags', () => {
  it('trims, drops blanks and duplicates', () => {
    expect(splitRuleTags(' a, b ,,a,  ,c')).toEqual(['a', 'b', 'c']);
    expect(splitRuleTags('')).toEqual([]);
  });
});

describe('formToRule', () => {
  const base: RawRssRule = {
    enabled: true,
    priority: 3,
    lastMatch: 'x',
    previouslyMatchedEpisodes: ['1x1'],
    customKey: 42,
    torrentParams: { ratio_limit: 2, category: 'old', use_auto_tmm: true },
  };

  it('preserves keys the form does not edit', () => {
    const rule = formToRule(base, ruleToForm(base));
    expect(rule).toMatchObject({
      enabled: true,
      priority: 3,
      lastMatch: 'x',
      previouslyMatchedEpisodes: ['1x1'],
      customKey: 42,
    });
    expect(rule.torrentParams).toMatchObject({ ratio_limit: 2, use_auto_tmm: true });
  });

  it('writes edited fields and normalizes them', () => {
    const form = {
      ...ruleToForm(base),
      category: 'tv',
      tags: 'a, a, b',
      episodeFilter: ' 1x1-; ',
      ignoreDays: 2.9,
      addStopped: 'always' as const,
      contentLayout: ContentLayout.Original,
    };
    const rule = formToRule(base, form);
    expect(rule.episodeFilter).toBe('1x1-;');
    expect(rule.ignoreDays).toBe(2);
    expect(rule.torrentParams).toMatchObject({
      category: 'tv',
      tags: ['a', 'b'],
      stopped: true,
      content_layout: ContentLayout.Original,
      save_path: '',
    });
  });

  it('clamps negative or invalid ignoreDays to zero', () => {
    expect(formToRule({}, { ...ruleToForm({}), ignoreDays: -4 }).ignoreDays).toBe(0);
    expect(formToRule({}, { ...ruleToForm({}), ignoreDays: Number.NaN }).ignoreDays).toBe(0);
  });

  it('disables auto TMM when a save path is set and keeps it otherwise', () => {
    const withPath = formToRule(base, {
      ...ruleToForm(base),
      saveToDifferentDirectory: true,
      savePath: ' /dl ',
    });
    expect(withPath.torrentParams).toMatchObject({ save_path: '/dl', use_auto_tmm: false });

    const cleared = formToRule(
      { torrentParams: { save_path: '/dl', use_auto_tmm: false } },
      { ...ruleToForm({}), saveToDifferentDirectory: false },
    );
    expect(cleared.torrentParams).toMatchObject({ save_path: '' });
    expect(cleared.torrentParams).not.toHaveProperty('use_auto_tmm');
  });

  it('maps default stopped/content layout to null', () => {
    const rule = formToRule({}, ruleToForm({}));
    expect(rule.torrentParams).toMatchObject({ stopped: null, content_layout: null });
  });
});

describe('sameRuleForm / cloneRuleForm', () => {
  it('ignores affected feed order and clones deeply enough to detach the feeds', () => {
    const a = { ...ruleToForm({}), affectedFeeds: ['x', 'y'] };
    const b = { ...ruleToForm({}), affectedFeeds: ['y', 'x'] };
    expect(sameRuleForm(a, b)).toBe(true);
    expect(sameRuleForm(a, { ...b, mustContain: 'z' })).toBe(false);
    const copy = cloneRuleForm(a);
    copy.affectedFeeds.push('z');
    expect(a.affectedFeeds).toEqual(['x', 'y']);
  });
});

describe('validation', () => {
  it('accepts empty and well-formed episode filters', () => {
    for (const ok of ['', '  ', '1x1;', '1x1-;', '1x1-5;', '1x1-5;7;', '01x01;', '1X1;'])
      expect(isValidEpisodeFilter(ok), ok).toBe(true);
    for (const bad of ['1x1', 'abc;', '1x;', '12345x1;', '1x1-5', ';'])
      expect(isValidEpisodeFilter(bad), bad).toBe(false);
  });

  it('reports regex problems', () => {
    expect(regexProblem('^a+$')).toBeNull();
    expect(regexProblem('(')).toEqual(expect.any(String));
  });
});

describe('lastMatchLabel', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');

  it('describes recency', () => {
    expect(lastMatchLabel(undefined, now)).toBe('Never matched');
    expect(lastMatchLabel('garbage', now)).toBe('Never matched');
    expect(lastMatchLabel('2024-06-10T01:00:00Z', now)).toBe('Last matched today');
    expect(lastMatchLabel('2024-06-09T01:00:00Z', now)).toBe('Last matched yesterday');
    expect(lastMatchLabel('2024-06-05T12:00:00Z', now)).toBe('Last matched 5 days ago');
  });

  it('treats a future timestamp as today', () => {
    expect(lastMatchLabel('2024-06-12T12:00:00Z', now)).toBe('Last matched today');
  });
});
