import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { emptyFilters, type TorrentFilters } from '@/lib/torrentFilters';
import { SAVED_VIEWS_KEY, useSavedViewsStore } from '@/stores/savedViews';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import { closeManage, manage } from '@/features/manage/manageState';
import ViewsSection from './ViewsSection.vue';

const withTag = (tag: string): TorrentFilters => ({
  ...emptyFilters(),
  tag: { include: [tag], exclude: [] },
});

let mounted: VueWrapper | undefined;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
  closeManage();
});

function mountWithViews(views: { id: string; name: string; tag: string }[]) {
  const store = useSavedViewsStore();
  store.views = views.map((v) => ({ id: v.id, name: v.name, filters: withTag(v.tag) }));
  store.loadState = 'ready';
  mounted = mount(ViewsSection, { attachTo: document.body });
  return mounted;
}

const rows = (w: VueWrapper) => w.findAll('[data-view-row]');
const row = (w: VueWrapper, name: string) => rows(w).find((r) => r.text() === name)!;

async function chooseFromContextMenu(w: VueWrapper, rowName: string, menuLabel: string) {
  await row(w, rowName).trigger('contextmenu');
  await flushPromises();
  const menuItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === menuLabel,
  );
  expect(menuItem, `menu item "${menuLabel}"`).toBeDefined();
  menuItem!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  (menuItem as HTMLElement).click();
  await flushPromises();
}

async function menuLabels(w: VueWrapper, rowName: string) {
  await row(w, rowName).trigger('contextmenu');
  await flushPromises();
  const labels = [...document.body.querySelectorAll('[role="menuitem"]')].map((el) =>
    el.textContent?.trim(),
  );
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flushPromises();
  return labels;
}

describe('ViewsSection', () => {
  it('renders nothing without saved views', () => {
    mounted = mount(ViewsSection);
    expect(rows(mounted)).toEqual([]);
    expect(mounted.text()).not.toContain('Views');
  });

  it('lists the views sorted by name', () => {
    const w = mountWithViews([
      { id: '1', name: 'beta', tag: 'b' },
      { id: '2', name: 'Alpha', tag: 'a' },
    ]);
    expect(rows(w).map((r) => r.text())).toEqual(['Alpha', 'beta']);
  });

  it('marks the row matching the current filters as pressed', async () => {
    const w = mountWithViews([
      { id: '1', name: 'A', tag: 'a' },
      { id: '2', name: 'B', tag: 'b' },
    ]);
    const ui = useUiStore();
    expect(rows(w).map((r) => r.attributes('aria-pressed'))).toEqual(['false', 'false']);
    ui.filters = withTag('b');
    await flushPromises();
    expect(rows(w).map((r) => r.attributes('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('applies a view on click, and clears the filters (not the search) when clicked again', async () => {
    const w = mountWithViews([{ id: '1', name: 'A', tag: 'a' }]);
    const ui = useUiStore();
    ui.search = 'ubuntu';
    await row(w, 'A').trigger('click');
    expect(ui.filters).toEqual(withTag('a'));
    await row(w, 'A').trigger('click');
    expect(ui.filters).toEqual(emptyFilters());
    expect(ui.search).toBe('ubuntu');
  });

  it('offers the update item only when filters are active and differ from the view', async () => {
    const w = mountWithViews([{ id: '1', name: 'A', tag: 'a' }]);
    const ui = useUiStore();
    expect(await menuLabels(w, 'A')).toEqual(['Rename…', 'Delete']);
    ui.filters = withTag('other');
    expect(await menuLabels(w, 'A')).toEqual(['Update to current filters', 'Rename…', 'Delete']);
    ui.filters = withTag('a');
    expect(await menuLabels(w, 'A')).toEqual(['Rename…', 'Delete']);
  });

  it('updates a view to the current filters from the context menu', async () => {
    const w = mountWithViews([{ id: '1', name: 'A', tag: 'a' }]);
    useUiStore().filters = withTag('other');
    await chooseFromContextMenu(w, 'A', 'Update to current filters');
    expect(useSavedViewsStore().views[0]!.filters).toEqual(withTag('other'));
    expect(useToastsStore().toasts.at(-1)!.action?.label).toBe('Undo');
  });

  it('opens the rename dialog for the chosen view', async () => {
    const w = mountWithViews([{ id: '1', name: 'A', tag: 'a' }]);
    await chooseFromContextMenu(w, 'A', 'Rename…');
    expect(manage.value).toEqual({ kind: 'renameView', id: '1' });
  });

  it('deletes a view from the context menu', async () => {
    const w = mountWithViews([{ id: '1', name: 'A', tag: 'a' }]);
    await chooseFromContextMenu(w, 'A', 'Delete');
    expect(useSavedViewsStore().views).toEqual([]);
    expect(rows(w)).toEqual([]);
    expect(localStorage.getItem(SAVED_VIEWS_KEY)).toBe('[]');
  });
});
