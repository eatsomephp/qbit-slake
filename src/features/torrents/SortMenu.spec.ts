import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { COMMON_SORT_FIELDS, OTHER_SORT_FIELDS, SORTABLE_FIELDS } from './columns';
import { sortMenuOpen } from './menuState';
import SortMenu from './SortMenu.vue';

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  sortMenuOpen.value = false;
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
});

async function openMenu() {
  wrapper = mount(SortMenu, { attachTo: document.body });
  sortMenuOpen.value = true;
  await flushPromises();
}

const radioItem = (label: string) =>
  [...document.body.querySelectorAll<HTMLElement>('[role=menuitemradio]')].find(
    (el) => el.textContent?.trim() === label,
  )!;

describe('SortMenu', () => {
  it('shows the current field and direction on the trigger', () => {
    wrapper = mount(SortMenu, { attachTo: document.body });
    expect(wrapper.find('[aria-label="Sort by Added on"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Sort descending"]').exists()).toBe(true);
  });

  it('lists every sortable field once, common fields first', async () => {
    await openMenu();
    const labels = [...document.body.querySelectorAll('[role=menuitemradio]')].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toEqual([...COMMON_SORT_FIELDS, ...OTHER_SORT_FIELDS].map((f) => f.label));
    expect(new Set(labels).size).toBe(SORTABLE_FIELDS.length);
    expect(radioItem('Added on').getAttribute('aria-checked')).toBe('true');
  });

  it("picking a field applies that column's natural direction", async () => {
    await openMenu();
    radioItem('Name').click();
    await flushPromises();
    expect(useUiStore().sorting).toEqual([{ id: 'name', desc: false }]);

    sortMenuOpen.value = true;
    await flushPromises();
    radioItem('Download speed').click();
    await flushPromises();
    expect(useUiStore().sorting).toEqual([{ id: 'dlspeed', desc: true }]);
  });

  it('flipping direction keeps secondary sort keys and shows their count', async () => {
    const ui = useUiStore();
    ui.sorting = [
      { id: 'size', desc: true },
      { id: 'name', desc: false },
    ];
    wrapper = mount(SortMenu, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain('+1');
    await wrapper.get('[aria-label="Sort descending"]').trigger('click');
    expect(ui.sorting).toEqual([
      { id: 'size', desc: false },
      { id: 'name', desc: false },
    ]);
  });
});
