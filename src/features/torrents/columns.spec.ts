import { describe, expect, it } from 'vitest';
import { reorderColumns, torrentColumns } from './columns';

const defaultOrder = torrentColumns.map((c) => c.id!);

describe('reorderColumns', () => {
  it('starts from the default order when none is saved', () => {
    const order = reorderColumns([], 'state', 'name', 'before');
    expect(order[0]).toBe('state');
    expect(order[1]).toBe('name');
    expect(order).toHaveLength(defaultOrder.length);
  });

  it('drops a column after the target', () => {
    const order = reorderColumns(defaultOrder, 'name', 'ratio', 'after');
    expect(order.indexOf('name')).toBe(order.indexOf('ratio') + 1);
  });

  it('ignores unknown saved ids and appends columns missing from the saved order', () => {
    const order = reorderColumns(['gone', 'size', 'name'], 'size', 'name', 'after');
    expect(order.slice(0, 2)).toEqual(['name', 'size']);
    expect(order).not.toContain('gone');
    expect(new Set(order)).toEqual(new Set(defaultOrder));
  });

  it('leaves the order alone when a column is dropped on itself', () => {
    expect(reorderColumns(defaultOrder, 'size', 'size', 'before')).toEqual(defaultOrder);
  });
});
