import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { DEFAULT_HIDDEN_COLUMNS } from './columns';
import { HIDEABLE_COLUMNS } from './useColumnVisibility';
import DisplayMenu from './DisplayMenu.vue';
import { displayMenuOpen } from './menuState';

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useUiStore().tableView = 'comfortable';
});

afterEach(() => {
  displayMenuOpen.value = false;
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
});

async function openMenu() {
  wrapper = mount(DisplayMenu, { attachTo: document.body });
  await wrapper.get('[aria-label="Display options"]').trigger('click');
  await flushPromises();
}

const layoutOption = (label: string) =>
  [...document.body.querySelectorAll<HTMLElement>('[role=radio]')].find(
    (el) => el.textContent?.trim() === label,
  )!;

function columnCheckbox(label: string) {
  const row = [...document.body.querySelectorAll('label')].find(
    (el) => el.textContent?.trim() === label,
  )!;
  return row.querySelector<HTMLElement>('[role=checkbox]')!;
}

const resetButton = () =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (el) => el.textContent?.trim() === 'Reset',
  )!;

const hiddenId = Object.keys(DEFAULT_HIDDEN_COLUMNS)[0]!;
const hiddenLabel = HIDEABLE_COLUMNS.find((c) => c.id === hiddenId)!.label;

describe('DisplayMenu', () => {
  it('renders nothing but the trigger until opened', () => {
    wrapper = mount(DisplayMenu, { attachTo: document.body });
    expect(wrapper.find('[aria-label="Display options"]').exists()).toBe(true);
    expect(document.body.querySelector('[role=radiogroup]')).toBeNull();
  });

  it('switches the layout through the segmented control', async () => {
    await openMenu();
    layoutOption('Compact').click();
    await flushPromises();
    expect(useUiStore().tableView).toBe('compact');
    layoutOption('Stacked').click();
    await flushPromises();
    expect(useUiStore().tableView).toBe('stacked');
  });

  it('opens from the shared menu state used by the keyboard shortcut', async () => {
    wrapper = mount(DisplayMenu, { attachTo: document.body });
    displayMenuOpen.value = true;
    await flushPromises();
    expect(document.body.querySelector('[role=radiogroup]')).not.toBeNull();
  });

  it('lists every hideable column with its current visibility', async () => {
    await openMenu();
    for (const { id, label } of HIDEABLE_COLUMNS) {
      const expected = id in DEFAULT_HIDDEN_COLUMNS ? 'false' : 'true';
      expect(columnCheckbox(label).getAttribute('aria-checked')).toBe(expected);
    }
  });

  it('writes column visibility to the ui store when a checkbox is toggled', async () => {
    await openMenu();
    columnCheckbox(hiddenLabel).click();
    await flushPromises();
    expect(useUiStore().columnVisibility[hiddenId]).toBe(true);
    expect(columnCheckbox(hiddenLabel).getAttribute('aria-checked')).toBe('true');
  });

  it('Reset restores default columns, sizing and order', async () => {
    const ui = useUiStore();
    ui.columnVisibility = { [hiddenId]: true };
    ui.columnSizing = { name: 400 };
    ui.columnOrder = ['size', 'name'];
    await openMenu();
    resetButton().click();
    await flushPromises();
    expect(ui.columnVisibility).toEqual({});
    expect(ui.columnSizing).toEqual({});
    expect(ui.columnOrder).toEqual([]);
  });

  it('disables column controls and explains why in the stacked layout', async () => {
    useUiStore().tableView = 'stacked';
    await openMenu();
    expect(document.body.textContent).toContain('The stacked layout has fixed columns.');
    expect(resetButton().disabled).toBe(true);
    expect(document.body.querySelector('fieldset')!.disabled).toBe(true);
    expect(columnCheckbox(hiddenLabel).hasAttribute('disabled')).toBe(true);
  });

  it('defaults to the stacked layout with column controls disabled', async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    await openMenu();
    expect(useUiStore().tableView).toBe('stacked');
    expect(resetButton().disabled).toBe(true);
  });

  it.each(['comfortable', 'compact'] as const)(
    'enables column controls in the %s layout',
    async (view) => {
      useUiStore().tableView = view;
      await openMenu();
      expect(document.body.textContent).not.toContain('fixed columns');
      expect(resetButton().disabled).toBe(false);
      expect(columnCheckbox(hiddenLabel).hasAttribute('disabled')).toBe(false);
    },
  );
});
