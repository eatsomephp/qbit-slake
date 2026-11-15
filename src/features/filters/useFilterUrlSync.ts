import { watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import { watchDebounced } from '@vueuse/core';
import { useUiStore } from '@/stores/ui';
import { parseQuery, serializeQuery } from '@/lib/filterQuery';

export const FILTER_QUERY_PARAM = 'q';
const SEARCH_URL_DEBOUNCE_MS = 400;
const FILTERED_ROUTE_NAME = 'main';

export function useFilterUrlSync() {
  const ui = useUiStore();
  const route = useRoute();
  const router = useRouter();

  const queryInRoute = (query: LocationQuery = route.query) => {
    const value = query[FILTER_QUERY_PARAM];
    return typeof value === 'string' ? value : null;
  };
  const currentQuery = () => serializeQuery(ui.filters, ui.search);
  const pendingWrites = new Set<string>();

  function applyRouteQuery(text: string) {
    const parsed = parseQuery(text);
    ui.filters = parsed.filters;
    ui.search = parsed.search;
  }

  function writeUrl(mode: 'push' | 'replace') {
    if (route.name !== FILTERED_ROUTE_NAME) return;
    const text = currentQuery();
    const rawInRoute = queryInRoute();
    const inRoute = rawInRoute ?? '';
    if (inRoute === text && (text || rawInRoute === null)) return;
    // A hand-written URL (aliases, odd order) is rewritten in place, or Back would land on
    // it and bounce straight forward again.
    const parsedRoute = parseQuery(inRoute);
    if (serializeQuery(parsedRoute.filters, parsedRoute.search) === text) mode = 'replace';
    const query = { ...route.query };
    if (text) query[FILTER_QUERY_PARAM] = text;
    else delete query[FILTER_QUERY_PARAM];
    pendingWrites.add(text);
    void router[mode]({ query });
  }

  const initial = route.name === FILTERED_ROUTE_NAME ? queryInRoute() : null;
  if (initial !== null) applyRouteQuery(initial);
  writeUrl('replace');

  watch(
    () => ui.filters,
    () => writeUrl('push'),
    { deep: true },
  );
  watchDebounced(
    () => ui.search,
    () => writeUrl('replace'),
    { debounce: SEARCH_URL_DEBOUNCE_MS },
  );
  watch(
    () => [route.name, route.query] as const,
    ([name, query], [previousName]) => {
      if (name !== FILTERED_ROUTE_NAME) return;
      // Coming back from a child route such as settings lands on a bare `/`: keep the
      // filters and put them back in the URL instead of clearing them.
      if (previousName !== FILTERED_ROUTE_NAME && queryInRoute(query) === null) {
        writeUrl('replace');
        return;
      }
      const text = queryInRoute(query) ?? '';
      // Our own writes carry half-typed tokens, and can land after newer edits:
      // applying them would commit tokens mid-typing or roll back those edits.
      if (pendingWrites.delete(text) || text === currentQuery()) return;
      applyRouteQuery(text);
    },
  );
}
