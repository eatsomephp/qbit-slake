import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/stores/ui';
import TableViewButton from './TableViewButton.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('TableViewButton', () => {
  it('cycles stacked, comfortable, compact and back on click', async () => {
    const ui = useUiStore();
    const w = mount(TableViewButton);
    const seen = [ui.tableView];
    for (let i = 0; i < 3; i++) {
      await w.get('button').trigger('click');
      seen.push(ui.tableView);
    }
    expect(seen).toEqual(['stacked', 'comfortable', 'compact', 'stacked']);
  });

  it('names the current layout', async () => {
    const ui = useUiStore();
    const w = mount(TableViewButton);
    ui.tableView = 'compact';
    await w.vm.$nextTick();
    expect(w.get('button').attributes('aria-label')).toContain('Compact');
  });
});
