import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import type { RawCookie } from '@/types/qbit';
import { useAppStore } from '@/stores/app';

const qbit = vi.hoisted(() => ({ getCookies: vi.fn(), setCookies: vi.fn() }));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { useCookiesDraft } = await import('./useCookiesDraft');
const { API } = await import('@/constants/qbit');

const cookie = (overrides: Partial<RawCookie> = {}): RawCookie => ({
  domain: 'example.com',
  path: '/',
  name: 'sid',
  value: 'abc',
  expirationDate: -1,
  ...overrides,
});

function mountDraft() {
  let draft!: ReturnType<typeof useCookiesDraft>;
  mount(
    defineComponent({
      setup() {
        draft = useCookiesDraft();
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return draft;
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  vi.spyOn(useAppStore(), 'isApiAvailable').mockReturnValue(true);
});

describe('useCookiesDraft', () => {
  it('does not fetch when the API is unavailable', async () => {
    vi.spyOn(useAppStore(), 'isApiAvailable').mockImplementation((api) => api !== API.cookies);
    const draft = mountDraft();
    await flushPromises();
    expect(draft.isAvailable.value).toBe(false);
    expect(qbit.getCookies).not.toHaveBeenCalled();
  });

  it('loads the saved cookies into rows and starts clean', async () => {
    qbit.getCookies.mockResolvedValue([cookie()]);
    const draft = mountDraft();
    expect(draft.dirty.value).toBe(false);
    await flushPromises();
    expect(draft.rows.value).toHaveLength(1);
    expect(draft.rows.value[0]).toMatchObject({ domain: 'example.com', name: 'sid' });
    expect(draft.dirty.value).toBe(false);
    expect(draft.hasProblems.value).toBe(false);
  });

  it('becomes dirty on edit and clean again on discard', async () => {
    qbit.getCookies.mockResolvedValue([cookie()]);
    const draft = mountDraft();
    await flushPromises();
    draft.rows.value[0]!.value = 'changed';
    expect(draft.dirty.value).toBe(true);
    draft.discard();
    expect(draft.rows.value[0]!.value).toBe('abc');
    expect(draft.dirty.value).toBe(false);
  });

  it('does not count a blank added row as a change, but reports problems for an incomplete one', async () => {
    qbit.getCookies.mockResolvedValue([cookie()]);
    const draft = mountDraft();
    await flushPromises();
    draft.rows.value.push({ key: 99, domain: '', path: '', name: '', value: '', expires: '' });
    expect(draft.dirty.value).toBe(false);
    draft.rows.value[1]!.value = 'orphan';
    expect(draft.hasProblems.value).toBe(true);
  });

  it('saves the draft, refetches and reloads the rows', async () => {
    qbit.getCookies.mockResolvedValueOnce([cookie()]);
    const draft = mountDraft();
    await flushPromises();
    draft.rows.value[0]!.value = 'new';
    qbit.setCookies.mockResolvedValue(undefined);
    qbit.getCookies.mockResolvedValue([cookie({ value: 'new' })]);
    await draft.save();
    expect(qbit.setCookies).toHaveBeenCalledWith([
      { domain: 'example.com', path: '/', name: 'sid', value: 'new' },
    ]);
    expect(draft.rows.value[0]!.value).toBe('new');
    expect(draft.dirty.value).toBe(false);
  });

  it('keeps the draft when saving fails', async () => {
    qbit.getCookies.mockResolvedValue([cookie()]);
    const draft = mountDraft();
    await flushPromises();
    draft.rows.value[0]!.value = 'new';
    qbit.setCookies.mockRejectedValue(new Error('nope'));
    await expect(draft.save()).rejects.toThrow('nope');
    expect(draft.rows.value[0]!.value).toBe('new');
    expect(draft.dirty.value).toBe(true);
  });
});
