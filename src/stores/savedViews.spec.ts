import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import qbit, { QbtHttpError } from '@/services/qbit';
import { emptyFilters, type TorrentFilters } from '@/lib/torrentFilters';
import { useAppStore } from './app';
import { SAVED_VIEWS_KEY, useSavedViewsStore } from './savedViews';
import { LEGACY_STORAGE_PREFIX } from '@/lib/legacyStorage';
import { useToastsStore } from './toasts';
import { useUiStore } from './ui';

const withTag = (tag: string): TorrentFilters => ({
  ...emptyFilters(),
  tag: { include: [tag], exclude: [] },
});
const storedView = (id: string, name: string, tag = 'x') => ({
  id,
  name,
  filters: withTag(tag),
});

const loadClientData = vi.spyOn(qbit, 'loadClientData');
const storeClientData = vi.spyOn(qbit, 'storeClientData');

function setup(webApiVersion: string, serverData: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  useAppStore().webApiVersion = webApiVersion;
  loadClientData.mockResolvedValue(serverData);
  return useSavedViewsStore();
}

const lastToast = () => useToastsStore().toasts.at(-1)!;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  loadClientData.mockReset();
  storeClientData.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('savedViews store: client data backend', () => {
  it('loads views from the server on API 2.13.1 and later', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
    await store.load();
    expect(loadClientData).toHaveBeenCalledWith([
      SAVED_VIEWS_KEY,
      LEGACY_STORAGE_PREFIX + 'savedViews',
    ]);
    expect(store.views.map((v) => v.name)).toEqual(['Movies']);
    expect(store.loadState).toBe('ready');
  });

  it('moves views stored under the legacy server key to the current key', async () => {
    const legacyKey = LEGACY_STORAGE_PREFIX + 'savedViews';
    const store = setup('2.13.1', { [legacyKey]: [storedView('a', 'Old')] });
    await store.load();
    expect(storeClientData).toHaveBeenCalledWith({
      [SAVED_VIEWS_KEY]: [storedView('a', 'Old')],
      [legacyKey]: null,
    });
    expect(store.views.map((v) => v.name)).toEqual(['Old']);
  });

  it('migrates local views to the server when the server has none', async () => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify([storedView('a', 'Local')]));
    const store = setup('2.14.0');
    await store.load();
    expect(storeClientData).toHaveBeenCalledWith({ [SAVED_VIEWS_KEY]: [storedView('a', 'Local')] });
    expect(localStorage.getItem(SAVED_VIEWS_KEY)).toBeNull();
    expect(store.views.map((v) => v.name)).toEqual(['Local']);
  });

  it('prefers the server views over local ones', async () => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify([storedView('a', 'Local')]));
    const store = setup('2.14.0', { [SAVED_VIEWS_KEY]: [storedView('b', 'Server')] });
    await store.load();
    expect(storeClientData).not.toHaveBeenCalled();
    expect(store.views.map((v) => v.name)).toEqual(['Server']);
  });

  it('stores null for the key when the last view is deleted', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
    await store.load();
    await store.remove('a');
    expect(storeClientData).toHaveBeenLastCalledWith({ [SAVED_VIEWS_KEY]: null });
    expect(store.views).toEqual([]);
  });

  it('saves a trimmed name with a copy of the filters', async () => {
    const store = setup('2.13.1');
    const filters = withTag('x');
    await expect(store.save('  Movies  ', filters)).resolves.toBe(true);
    filters.tag.include.push('mutated');
    expect(store.views[0]).toMatchObject({ name: 'Movies', filters: withTag('x') });
    const written = storeClientData.mock.calls[0]![0][SAVED_VIEWS_KEY] as unknown[];
    expect(written).toEqual([store.views[0]]);
  });

  describe('failed writes', () => {
    it('rolls back and shows an error toast', async () => {
      const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
      await store.load();
      storeClientData.mockRejectedValue(new QbtHttpError(500, 'disk full'));
      await expect(store.save('Shows', emptyFilters())).resolves.toBe(false);
      expect(store.views.map((v) => v.name)).toEqual(['Movies']);
      expect(lastToast()).toMatchObject({ kind: 'error' });
      expect(lastToast().message).toContain('disk full');
    });

    it('shows no toast for a 403', async () => {
      const store = setup('2.13.1');
      await store.load();
      storeClientData.mockRejectedValue(new QbtHttpError(403, 'Forbidden'));
      await expect(store.save('Shows', emptyFilters())).resolves.toBe(false);
      expect(store.views).toEqual([]);
      expect(useToastsStore().toasts).toEqual([]);
    });
  });

  it('refuses writes when loading failed, without touching the server', async () => {
    const store = setup('2.13.1');
    loadClientData.mockRejectedValue(new QbtHttpError(500, 'boom'));
    await expect(store.save('Shows', emptyFilters())).resolves.toBe(false);
    expect(store.loadState).toBe('failed');
    expect(storeClientData).not.toHaveBeenCalled();
    expect(store.views).toEqual([]);
  });
});

describe('savedViews store: localStorage backend', () => {
  it('loads from and saves to localStorage on older APIs', async () => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify([storedView('a', 'Old')]));
    const store = setup('2.11.0');
    await store.load();
    expect(store.views.map((v) => v.name)).toEqual(['Old']);
    await store.save('New', emptyFilters());
    expect(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY)!)).toHaveLength(2);
    expect(loadClientData).not.toHaveBeenCalled();
    expect(storeClientData).not.toHaveBeenCalled();
  });

  it('treats corrupt local data as no views', async () => {
    localStorage.setItem(SAVED_VIEWS_KEY, '{not json');
    const store = setup('2.11.0');
    await store.load();
    expect(store.views).toEqual([]);
    expect(store.loadState).toBe('ready');
  });
});

describe('savedViews store: mutations', () => {
  it('rejects invalid or duplicate names without writing', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
    await expect(store.save('movies', emptyFilters())).resolves.toBe(false);
    await expect(store.save('   ', emptyFilters())).resolves.toBe(false);
    await expect(store.rename('a', 'x'.repeat(101))).resolves.toBe(false);
    await store.save('Shows', emptyFilters());
    storeClientData.mockClear();
    const showsId = store.views.find((v) => v.name === 'Shows')!.id;
    await expect(store.rename(showsId, 'MOVIES')).resolves.toBe(false);
    expect(storeClientData).not.toHaveBeenCalled();
  });

  it('renames a view, allowing a change of case only', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'movies')] });
    await expect(store.rename('a', ' Movies ')).resolves.toBe(true);
    expect(store.views[0]!.name).toBe('Movies');
  });

  it('applies a view to the ui as a copy', () => {
    const store = setup('2.13.1');
    const ui = useUiStore();
    const view = storedView('a', 'Movies');
    store.apply(view);
    expect(ui.filters).toEqual(view.filters);
    ui.filters.tag.include.push('more');
    expect(view.filters.tag.include).toEqual(['x']);
  });

  it('tracks which views match the current filters', async () => {
    const store = setup('2.13.1', {
      [SAVED_VIEWS_KEY]: [storedView('a', 'A', 'x'), storedView('b', 'B', 'y')],
    });
    await store.load();
    const ui = useUiStore();
    expect([...store.matchingViewIds]).toEqual([]);
    ui.filters = withTag('y');
    expect([...store.matchingViewIds]).toEqual(['b']);
  });

  it('updates to the current filters and offers an Undo that restores the old ones', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies', 'old')] });
    await store.load();
    useUiStore().filters = withTag('new');
    await expect(store.updateToCurrentFilters('a')).resolves.toBe(true);
    expect(store.views[0]!.filters).toEqual(withTag('new'));

    const toasts = useToastsStore();
    expect(lastToast().message).toContain('Movies');
    toasts.runAction(lastToast());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.views[0]!.filters).toEqual(withTag('old'));
    expect(storeClientData).toHaveBeenLastCalledWith({
      [SAVED_VIEWS_KEY]: [storedView('a', 'Movies', 'old')],
    });
  });

  it('offers an Undo after deleting that restores the view', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
    await store.load();
    await store.remove('a');
    expect(store.views).toEqual([]);
    useToastsStore().runAction(lastToast());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.views).toEqual([storedView('a', 'Movies')]);
  });

  it('does not restore a deleted view whose name was taken in the meantime', async () => {
    const store = setup('2.13.1', { [SAVED_VIEWS_KEY]: [storedView('a', 'Movies')] });
    await store.load();
    await store.remove('a');
    const undo = lastToast();
    await store.save('movies', emptyFilters());
    useToastsStore().runAction(undo);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.views.map((v) => v.name)).toEqual(['movies']);
  });
});
