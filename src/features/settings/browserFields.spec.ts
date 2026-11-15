import { describe, expect, it } from 'vitest';
import { BROWSER_FIELDS, BROWSER_SECTION } from './browserFields';

describe('BROWSER_FIELDS', () => {
  it('keys every field by its own record key and labels it', () => {
    for (const [key, field] of Object.entries(BROWSER_FIELDS)) {
      expect(field.key).toBe(key);
      expect(field.label).not.toBe('');
    }
  });
});

describe('BROWSER_SECTION', () => {
  it('lists every field exactly once in a single group', () => {
    expect(BROWSER_SECTION.groups).toHaveLength(1);
    expect(BROWSER_SECTION.groups[0]!.fields.map((f) => f.key).sort()).toEqual(
      Object.keys(BROWSER_FIELDS).sort(),
    );
  });
});
