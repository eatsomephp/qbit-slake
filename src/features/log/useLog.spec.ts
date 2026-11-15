import { describe, expect, it } from 'vitest';
import type { RawLogEntry } from '@/types/qbit';
import { appendEntries } from './useLog';

const e = (id: number): RawLogEntry => ({ id, message: `m${id}`, timestamp: id, type: 1 });

describe('appendEntries', () => {
  it('appends only newer ids', () => {
    const out = appendEntries([e(0), e(1)], [e(1), e(2), e(3)]);
    expect(out.map((x) => x.id)).toEqual([0, 1, 2, 3]);
  });

  it('returns the same array when nothing is new', () => {
    const current = [e(0)];
    expect(appendEntries(current, [e(0)])).toBe(current);
  });

  it('drops the oldest entries past the cap', () => {
    const out = appendEntries([e(0), e(1)], [e(2), e(3)], 3);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
