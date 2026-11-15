import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { emptyFilters } from '@/lib/torrentFilters';
import { SAVED_VIEWS_KEY, useSavedViewsStore } from '@/stores/savedViews';
import { useUiStore } from '@/stores/ui';
import ManageDialogs from './ManageDialogs.vue';
import { closeManage, manage, openManage } from './manageState';

let wrapper: ReturnType<typeof mount> | null = null;
const input = () => document.querySelector<HTMLInputElement>('[role=dialog] input')!;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
async function type(value: string) {
  input().value = value;
  input().dispatchEvent(new Event('input'));
  await flushPromises();
}
const storedNames = () =>
  (JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]') as { name: string }[]).map(
    (v) => v.name,
  );

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSavedViewsStore();
  store.views = [{ id: '1', name: 'Movies', filters: emptyFilters() }];
  store.loadState = 'ready';
  wrapper = mount(ManageDialogs, { attachTo: document.body });
});
afterEach(() => {
  wrapper?.unmount();
  closeManage();
  document.body.innerHTML = '';
});

describe('ViewNameDialog', () => {
  it('saves the current filters under the typed name and closes', async () => {
    const filters = { ...emptyFilters(), tag: { include: ['x'], exclude: [] } };
    useUiStore().filters = filters;
    openManage({ kind: 'saveView' });
    await flushPromises();
    expect(button('Save view').disabled).toBe(true);
    await type('  Shows ');
    button('Save view').click();
    await flushPromises();
    expect(useSavedViewsStore().views.find((v) => v.name === 'Shows')?.filters).toEqual(filters);
    expect(storedNames()).toContain('Shows');
    expect(manage.value).toBeNull();
  });

  it('shows an inline error and disables Save for a duplicate or too long name', async () => {
    openManage({ kind: 'saveView' });
    await flushPromises();
    await type('movies');
    expect(document.body.textContent).toContain('already exists');
    expect(button('Save view').disabled).toBe(true);
    await type('a'.repeat(101));
    expect(document.body.textContent).toContain('100 characters or fewer');
    expect(button('Save view').disabled).toBe(true);
    await type('ok');
    expect(document.body.textContent).not.toContain('100 characters or fewer');
    expect(button('Save view').disabled).toBe(false);
  });

  it('renames, starting prefilled and disabled until the name changes', async () => {
    openManage({ kind: 'renameView', id: '1' });
    await flushPromises();
    expect(input().value).toBe('Movies');
    expect(button('Rename').disabled).toBe(true);
    await type('Films');
    button('Rename').click();
    await flushPromises();
    expect(useSavedViewsStore().views[0]!.name).toBe('Films');
    expect(manage.value).toBeNull();
  });
});
