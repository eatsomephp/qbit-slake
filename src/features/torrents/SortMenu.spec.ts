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
    expect(wrapper.find('[aria-label="Sort order: Newest first"]').exists()).toBe(true);
  });

  it('lists the order choices, then common fields, then the rest', async () => {
    await openMenu();
    const labels = [...document.body.querySelectorAll('[role=menuitemradio]')].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Newest first',
      'Oldest first',
      ...COMMON_SORT_FIELDS.map((f) => f.label),
      ...OTHER_SORT_FIELDS.map((f) => f.label),
    ]);
    expect(radioItem('Added on').getAttribute('aria-checked')).toBe('true');
    expect(radioItem('Newest first').getAttribute('aria-checked')).toBe('true');
    expect(COMMON_SORT_FIELDS.length + OTHER_SORT_FIELDS.length).toBe(SORTABLE_FIELDS.length);
  });

  it('checks a field from the more columns section when it is the sort field', async () => {
    useUiStore().sorting = [{ id: 'tracker', desc: false }];
    await openMenu();
    expect(radioItem('Tracker').getAttribute('aria-checked')).toBe('true');
  });

  it('picking an order in the menu sets the direction', async () => {
    await openMenu();
    radioItem('Oldest first').click();
    await flushPromises();
    expect(useUiStore().sorting).toEqual([{ id: 'addedOn', desc: false }]);
  });

  it('lists secondary sort keys and removes one when picked', async () => {
    const ui = useUiStore();
    ui.sorting = [
      { id: 'size', desc: true },
      { id: 'name', desc: false },
      { id: 'ratio', desc: true },
    ];
    await openMenu();
    const remove = document.body.querySelector<HTMLElement>(
      '[aria-label="Remove secondary sort by Name"]',
    )!;
    expect(remove.textContent).toContain('A → Z');
    remove.click();
    await flushPromises();
    expect(ui.sorting).toEqual([
      { id: 'size', desc: true },
      { id: 'ratio', desc: true },
    ]);
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
    await wrapper.get('[aria-label="Sort order: Largest first"]').trigger('click');
    expect(ui.sorting).toEqual([
      { id: 'size', desc: false },
      { id: 'name', desc: false },
    ]);
  });
});
