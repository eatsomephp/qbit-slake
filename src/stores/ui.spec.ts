import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { emptyFilters } from '@/lib/torrentFilters';
import { useUiStore } from './ui';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('ui store filters', () => {
  it('drops the pre-v2 filters key and starts empty', () => {
    localStorage.setItem(
      'slake:filters',
      JSON.stringify({ status: { include: ['running'], exclude: [] } }),
    );
    const ui = useUiStore();
    expect(localStorage.getItem('slake:filters')).toBeNull();
    expect(ui.filters).toEqual(emptyFilters());
  });

  it('updateFilterGroup replaces one group and keeps the rest', () => {
    const ui = useUiStore();
    ui.filters = { ...ui.filters, activity: 'idle' };
    ui.updateFilterGroup('tag', () => ({ include: ['x'], exclude: [] }));
    expect(ui.filters).toEqual({
      ...emptyFilters(),
      activity: 'idle',
      tag: { include: ['x'], exclude: [] },
    });
  });
});

describe('ui store sidebarCountMode', () => {
  it('defaults to matching', () => {
    expect(useUiStore().sidebarCountMode).toBe('matching');
  });

  it('persists under its own key', async () => {
    const ui = useUiStore();
    ui.sidebarCountMode = 'all';
    await nextTick();
    expect(localStorage.getItem('slake:sidebarCountMode')).toBe('all');
  });

  it('restores a stored value', () => {
    localStorage.setItem('slake:sidebarCountMode', 'all');
    expect(useUiStore().sidebarCountMode).toBe('all');
  });
});
