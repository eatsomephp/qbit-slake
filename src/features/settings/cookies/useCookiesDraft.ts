import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { API } from '@/constants/qbit';
import qbit from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import type { RawCookie } from '@/types/qbit';
import {
  cookieProblems,
  cookiesToRows,
  rowsToCookies,
  sameCookies,
  type CookieRow,
} from './cookieRows';

const COOKIES_QUERY_KEY = ['cookies'];

export const COOKIES_SECTION = { id: 'cookies', title: 'Cookies', after: 'downloads' } as const;

export function useCookiesDraft() {
  const app = useAppStore();
  const queryClient = useQueryClient();
  const isAvailable = computed(() => app.isApiAvailable(API.cookies));

  const {
    data: savedCookies,
    error,
    isPending,
  } = useQuery({
    queryKey: COOKIES_QUERY_KEY,
    queryFn: ({ signal }) => qbit.getCookies(signal),
    enabled: isAvailable,
    refetchOnWindowFocus: false,
  });

  const rows = ref<CookieRow[]>([]);
  watch(savedCookies, (cookies) => cookies && (rows.value = cookiesToRows(cookies)), {
    immediate: true,
  });

  const dirty = computed(
    () =>
      savedCookies.value !== undefined &&
      !sameCookies(rowsToCookies(rows.value), rowsToCookies(cookiesToRows(savedCookies.value))),
  );
  const problems = computed(() => cookieProblems(rows.value));
  const hasProblems = computed(() => problems.value.length > 0);

  async function save() {
    await qbit.setCookies(rowsToCookies(rows.value));
    await queryClient.invalidateQueries({ queryKey: COOKIES_QUERY_KEY });
    rows.value = cookiesToRows(queryClient.getQueryData<RawCookie[]>(COOKIES_QUERY_KEY) ?? []);
  }

  function discard() {
    if (savedCookies.value) rows.value = cookiesToRows(savedCookies.value);
  }

  return { isAvailable, rows, dirty, problems, hasProblems, error, isPending, save, discard };
}
