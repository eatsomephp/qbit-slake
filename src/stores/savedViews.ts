import { defineStore } from 'pinia';
import { LEGACY_STORAGE_PREFIX, STORAGE_PREFIX } from '@/lib/legacyStorage';
import { computed, ref, toRaw } from 'vue';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { API } from '@/constants/qbit';
import {
  cloneFilters,
  filtersEqual,
  newViewId,
  parseSavedViews,
  sortViewsByName,
  viewNameError,
  type SavedView,
} from '@/lib/savedViews';
import { emptyFilters, type TorrentFilters } from '@/lib/torrentFilters';
import { useAppStore } from './app';
import { useToastsStore } from './toasts';
import { useUiStore } from './ui';

export const SAVED_VIEWS_KEY = STORAGE_PREFIX + 'savedViews';
const LEGACY_SAVED_VIEWS_KEY = LEGACY_STORAGE_PREFIX + 'savedViews';

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

export const useSavedViewsStore = defineStore('savedViews', () => {
  const app = useAppStore();
  const ui = useUiStore();
  const toasts = useToastsStore();

  const views = ref<SavedView[]>([]);
  const loadState = ref<LoadState>('idle');
  let pendingLoad: Promise<boolean> | null = null;
  let changeQueue: Promise<unknown> = Promise.resolve();

  const sortedViews = computed(() => sortViewsByName(views.value));
  const matchingViewIds = computed(
    () => new Set(views.value.filter((v) => filtersEqual(v.filters, ui.filters)).map((v) => v.id)),
  );

  const isStoredOnServer = () => app.isApiAvailable(API.clientData);

  function readLocal(): unknown {
    try {
      return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  async function readStored(): Promise<SavedView[]> {
    if (!isStoredOnServer()) return parseSavedViews(readLocal());
    const clientData = await qbit.loadClientData([SAVED_VIEWS_KEY, LEGACY_SAVED_VIEWS_KEY]);
    const stored = clientData[SAVED_VIEWS_KEY];
    if (stored !== undefined) return parseSavedViews(stored);
    const legacyStored = clientData[LEGACY_SAVED_VIEWS_KEY];
    if (legacyStored !== undefined) {
      await qbit.storeClientData({
        [SAVED_VIEWS_KEY]: legacyStored,
        [LEGACY_SAVED_VIEWS_KEY]: null,
      });
      return parseSavedViews(legacyStored);
    }
    const localViews = parseSavedViews(readLocal());
    if (localViews.length) {
      await qbit.storeClientData({ [SAVED_VIEWS_KEY]: localViews });
      localStorage.removeItem(SAVED_VIEWS_KEY);
    }
    return localViews;
  }

  async function writeStored(next: SavedView[]) {
    if (!isStoredOnServer()) {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
      return;
    }
    await qbit.storeClientData({ [SAVED_VIEWS_KEY]: next.length ? next : null });
  }

  function reportFailure(label: string, err: unknown) {
    // 403 is handled globally (back to login).
    if (err instanceof QbtHttpError && err.status === 403) return;
    toasts.error(`${label}: ${describeQbtError(err)}`);
  }

  function load(): Promise<boolean> {
    loadState.value = 'loading';
    pendingLoad = readStored()
      .then((stored) => {
        views.value = stored;
        loadState.value = 'ready';
        return true;
      })
      .catch((err: unknown) => {
        loadState.value = 'failed';
        reportFailure("Couldn't load saved views", err);
        return false;
      })
      .finally(() => (pendingLoad = null));
    return pendingLoad;
  }

  function ensureLoaded(): Promise<boolean> {
    if (loadState.value === 'ready') return Promise.resolve(true);
    return pendingLoad ?? load();
  }

  // Writing before a successful load would replace the stored views with a partial list.
  function change(
    failureLabel: string,
    update: (current: SavedView[]) => SavedView[] | null,
  ): Promise<boolean> {
    const run = async () => {
      if (!(await ensureLoaded())) return false;
      const previous = views.value;
      const next = update(previous);
      if (!next) return false;
      views.value = next;
      try {
        await writeStored(next);
        return true;
      } catch (err) {
        if (toRaw(views.value) === next) views.value = previous;
        reportFailure(failureLabel, err);
        return false;
      }
    };
    const result = changeQueue.then(run);
    changeQueue = result;
    return result;
  }

  const findView = (id: string) => views.value.find((v) => v.id === id);

  function save(name: string, filters: TorrentFilters): Promise<boolean> {
    return change("Couldn't save the view", (current) =>
      viewNameError(name, current)
        ? null
        : [...current, { id: newViewId(), name: name.trim(), filters: cloneFilters(filters) }],
    );
  }

  function rename(id: string, name: string): Promise<boolean> {
    return change("Couldn't rename the view", (current) =>
      viewNameError(name, current, id) || !current.some((v) => v.id === id)
        ? null
        : current.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)),
    );
  }

  function replaceFilters(id: string, filters: TorrentFilters, failureLabel: string) {
    return change(failureLabel, (current) =>
      current.some((v) => v.id === id)
        ? current.map((v) => (v.id === id ? { ...v, filters: cloneFilters(filters) } : v))
        : null,
    );
  }

  async function updateToCurrentFilters(id: string): Promise<boolean> {
    const view = findView(id);
    if (!view) return false;
    const previousFilters = view.filters;
    if (!(await replaceFilters(id, ui.filters, "Couldn't update the view"))) return false;
    toasts.undoable(
      `Updated “${view.name}”`,
      () => void replaceFilters(id, previousFilters, "Couldn't undo the update"),
    );
    return true;
  }

  async function remove(id: string): Promise<boolean> {
    const view = findView(id);
    if (!view) return false;
    const removed = await change("Couldn't delete the view", (current) =>
      current.filter((v) => v.id !== id),
    );
    if (!removed) return false;
    toasts.undoable(
      `Deleted “${view.name}”`,
      () =>
        void change("Couldn't restore the view", (current) =>
          current.some((v) => v.id === id || v.name.toLowerCase() === view.name.toLowerCase())
            ? null
            : [...current, view],
        ),
    );
    return true;
  }

  function apply(view: SavedView) {
    ui.filters = cloneFilters(view.filters);
  }

  function toggleApplied(view: SavedView) {
    if (matchingViewIds.value.has(view.id)) ui.filters = emptyFilters();
    else apply(view);
  }

  return {
    views,
    sortedViews,
    matchingViewIds,
    loadState,
    load,
    save,
    rename,
    updateToCurrentFilters,
    remove,
    apply,
    toggleApplied,
  };
});
