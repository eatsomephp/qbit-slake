import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { DEFAULT_HIDDEN_COLUMNS } from './columns';
import { HIDEABLE_COLUMNS, useColumnVisibility } from './useColumnVisibility';

const hiddenByDefault = Object.keys(DEFAULT_HIDDEN_COLUMNS)[0]!;
const visibleByDefault = HIDEABLE_COLUMNS.find((c) => !(c.id in DEFAULT_HIDDEN_COLUMNS))!.id;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('useColumnVisibility', () => {
  it('lists only hideable columns', () => {
    expect(HIDEABLE_COLUMNS.map((c) => c.id)).not.toContain('name');
  });

  it('applies the default hidden columns before any user choice', () => {
    const { isVisible } = useColumnVisibility();
    expect(isVisible(hiddenByDefault)).toBe(false);
    expect(isVisible(visibleByDefault)).toBe(true);
  });

  it('shows a default-hidden column on first toggle and hides it again on the second', () => {
    const { toggle, isVisible } = useColumnVisibility();
    toggle(hiddenByDefault);
    expect(isVisible(hiddenByDefault)).toBe(true);
    toggle(hiddenByDefault);
    expect(isVisible(hiddenByDefault)).toBe(false);
  });

  it('hides a default-visible column on toggle without disturbing the default-hidden ones', () => {
    const { toggle, isVisible } = useColumnVisibility();
    toggle(visibleByDefault);
    expect(isVisible(visibleByDefault)).toBe(false);
    expect(isVisible(hiddenByDefault)).toBe(false);
    expect(useUiStore().columnVisibility[visibleByDefault]).toBe(false);
  });

  it('keeps the Tags column out of the table while tags sit beside the name', () => {
    const ui = useUiStore();
    const { tableVisibility, tagsBesideName, toggle } = useColumnVisibility();
    expect(tableVisibility.value.tags).toBe(false);
    expect(tagsBesideName.value).toBe(true);
    toggle('tags');
    expect(tagsBesideName.value).toBe(false);
    toggle('tags');
    ui.tagsInName = false;
    expect(tableVisibility.value.tags).toBe(true);
    expect(tagsBesideName.value).toBe(false);
  });

  it('resetLayout clears visibility, sizing and order', () => {
    const ui = useUiStore();
    const { toggle, resetLayout, isVisible } = useColumnVisibility();
    toggle(hiddenByDefault);
    ui.columnSizing = { name: 300 };
    ui.columnOrder = ['size', 'name'];
    resetLayout();
    expect(ui.columnVisibility).toEqual({});
    expect(ui.columnSizing).toEqual({});
    expect(ui.columnOrder).toEqual([]);
    expect(isVisible(hiddenByDefault)).toBe(false);
  });
});
