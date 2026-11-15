import { describe, expect, it } from 'vitest';
import { PREFERENCES_5_3_0 } from '@/services/qbit/fixtures/preferences-5.3.0';
import { COMPOSITES, NOT_RENDERED, SECTIONS, fieldKeys } from './index';

const fixtureKeys = Object.keys(PREFERENCES_5_3_0);
const compositeKeys = new Set(COMPOSITES.flatMap((composite) => composite.keys));
const schemaFields = SECTIONS.flatMap((section) => section.groups.flatMap((g) => g.fields));
const schemaKeyList = schemaFields.flatMap(fieldKeys).filter((key) => !compositeKeys.has(key));

const schemaKeys = new Set(schemaKeyList);
const notRenderedKeys = new Set(Object.keys(NOT_RENDERED));

const homes: Record<string, ReadonlySet<string>> = {
  schema: schemaKeys,
  composites: compositeKeys,
  NOT_RENDERED: notRenderedKeys,
};

const intersection = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((key) => b.has(key));

describe('settings schema coverage of the 5.3.0 fixture', () => {
  it('places every fixture key in exactly one home', () => {
    const placement = fixtureKeys
      .map((key) => ({
        key,
        homes: Object.entries(homes)
          .filter(([, keys]) => keys.has(key))
          .map(([name]) => name),
      }))
      .filter((entry) => entry.homes.length !== 1);
    expect(placement).toEqual([]);
  });

  it('keeps the homes pairwise disjoint', () => {
    const names = Object.keys(homes);
    const overlaps = names.flatMap((a, i) =>
      names
        .slice(i + 1)
        .map((b) => ({ pair: `${a}/${b}`, keys: intersection(homes[a]!, homes[b]!) })),
    );
    expect(overlaps.filter((o) => o.keys.length > 0)).toEqual([]);
  });

  it('declares no schema key twice', () => {
    const seen = new Set<string>();
    const duplicates = schemaKeyList.filter((key) => (seen.has(key) ? true : !seen.add(key)));
    expect(duplicates).toEqual([]);
  });

  it('has no stale NOT_RENDERED entries', () => {
    expect([...notRenderedKeys].filter((key) => !(key in PREFERENCES_5_3_0))).toEqual([]);
  });

  it('only gives enabledBy a key that is itself in the schema', () => {
    const missing = schemaFields
      .filter((field) => field.enabledBy && !schemaKeys.has(field.enabledBy))
      .map((field) => field.key);
    expect(missing).toEqual([]);
  });
});
