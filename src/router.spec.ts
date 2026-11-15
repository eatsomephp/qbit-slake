import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, type Router } from 'vue-router';
import { QbtHttpError } from '@/services/qbit/http';

const qbit = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getVersion: vi.fn(),
  getWebApiVersion: vi.fn(),
  getMaindata: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { createAppRouter, decodeMagnetParam, safeRedirect } = await import('./router');
const { addRequest, resetAdd } = await import('./features/add/addState');
const { useAppStore } = await import('./stores/app');

let router: Router;

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  qbit.getWebApiVersion.mockResolvedValue('2.11.4');
  router = createAppRouter(createMemoryHistory());
});

describe('router guard', () => {
  it('sends an unauthenticated user to login with a redirect', async () => {
    qbit.getVersion.mockRejectedValue(new QbtHttpError(403, 'Forbidden'));
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/');
    expect(useAppStore().auth).toBe('unauthenticated');
  });

  it('lets an authenticated session through (e.g. auth bypass for localhost)', async () => {
    qbit.getVersion.mockResolvedValue('5.1.2');
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('main');
    expect(useAppStore().version).toBe('5.1.2');
  });

  it('routes to login when qBittorrent is unreachable', async () => {
    qbit.getVersion.mockRejectedValue(new TypeError('Failed to fetch'));
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('login');
    expect(useAppStore().auth).toBe('unknown');
  });

  it('bounces an authenticated user away from login to the redirect target', async () => {
    qbit.getVersion.mockResolvedValue('5.1.2');
    await router.push({ name: 'login', query: { redirect: '/' } });
    expect(router.currentRoute.value.name).toBe('main');
  });
});

describe('settings route', () => {
  it.each([
    ['/settings', undefined],
    ['/settings/speed', 'speed'],
  ])('opens %s with section %j', async (path, section) => {
    qbit.getVersion.mockResolvedValue('5.1.2');
    await router.push(path);
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.params.section).toBe(section);
  });

  it('keeps the section in the login redirect when signed out', async () => {
    qbit.getVersion.mockRejectedValue(new QbtHttpError(403, 'Forbidden'));
    await router.push('/settings/speed');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/settings/speed');
  });
});

describe('app store', () => {
  it('login loads versions on success and reports bad credentials', async () => {
    const app = useAppStore();
    qbit.getVersion.mockResolvedValue('5.0.0');
    qbit.login.mockResolvedValueOnce(false);
    expect(await app.login('u', 'bad')).toBe(false);
    expect(app.auth).toBe('unknown');

    qbit.login.mockResolvedValueOnce(true);
    expect(await app.login('u', 'good')).toBe(true);
    expect(app.auth).toBe('authenticated');
    expect(app.isVersionSupported).toBe(true);
  });

  it('flags versions below the minimum as unsupported', async () => {
    const app = useAppStore();
    qbit.getVersion.mockResolvedValue('4.6.7');
    await app.checkSession();
    expect(app.isVersionSupported).toBe(false);
  });

  it('logout clears session state even if the request fails', async () => {
    const app = useAppStore();
    qbit.getVersion.mockResolvedValue('5.1.2');
    await app.checkSession();
    qbit.logout.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(app.logout()).rejects.toThrow();
    expect(app.auth).toBe('unauthenticated');
    expect(app.version).toBeNull();
  });

  it('isFeatureAvailable compares against the running version', async () => {
    const app = useAppStore();
    qbit.getVersion.mockResolvedValue('5.1.2');
    await app.checkSession();
    expect(app.isFeatureAvailable('5.1')).toBe(true);
    expect(app.isFeatureAvailable('5.2.0')).toBe(false);
  });
});

describe('safeRedirect', () => {
  it.each([
    ['/settings', '/settings'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    [undefined, '/'],
    [['/a'], '/'],
  ])('%j → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe('magnet route', () => {
  const magnet = 'magnet:?xt=urn:btih:abc&dn=Debian 12';

  it('opens the add dialog with the magnet and lands on the main view', async () => {
    resetAdd();
    addRequest.open = false;
    qbit.getVersion.mockResolvedValue('5.1.2');
    await router.push(`/magnet/${encodeURIComponent(magnet)}`);
    expect(router.currentRoute.value.name).toBe('main');
    expect(addRequest.open).toBe(true);
    expect(addRequest.text).toBe(magnet);
  });

  it('goes through login first when signed out, keeping the magnet for afterwards', async () => {
    qbit.getVersion.mockRejectedValue(new QbtHttpError(403, 'Forbidden'));
    await router.push(`/magnet/${encodeURIComponent(magnet)}`);
    expect(router.currentRoute.value.name).toBe('login');
    expect(String(router.currentRoute.value.query.redirect)).toContain('/magnet/');
  });

  it.each([
    [encodeURIComponent(magnet), magnet],
    [encodeURIComponent(encodeURIComponent(magnet)), magnet],
    [magnet, magnet],
    [['magnet:?xt=a', 'b'], 'magnet:?xt=a/b'],
  ])('decodes %j', (input, expected) => {
    expect(decodeMagnetParam(input)).toBe(expected);
  });
});
