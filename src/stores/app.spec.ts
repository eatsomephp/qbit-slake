import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { API } from '@/constants/qbit';
import { QbtHttpError } from '@/services/qbit';
import qbit from '@/services/qbit';
import { useAppStore, MIN_QBT_VERSION } from './app';
import { useTorrentsStore } from './torrents';

vi.mock('@/services/qbit', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/qbit/http')>('@/services/qbit/http');
  return {
    QbtHttpError: actual.QbtHttpError,
    default: {
      getVersion: vi.fn(),
      getWebApiVersion: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
});

const provider = vi.mocked(qbit);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  provider.getVersion.mockResolvedValue('5.1.0');
  provider.getWebApiVersion.mockResolvedValue('2.12.0');
});

describe('app store version gating', () => {
  it('has no supported version or features before versions load', () => {
    const app = useAppStore();
    expect(app.isVersionSupported).toBe(false);
    expect(app.isFeatureAvailable('1.0.0')).toBe(false);
    expect(app.isApiAvailable('1.0.0')).toBe(false);
  });

  it('supports the minimum qBittorrent version and rejects older ones', async () => {
    const app = useAppStore();
    app.version = MIN_QBT_VERSION;
    expect(app.isVersionSupported).toBe(true);
    app.version = '4.6.7';
    expect(app.isVersionSupported).toBe(false);
  });

  it('gates API features on the WebAPI version, inclusive of the minimum', async () => {
    const app = useAppStore();
    app.webApiVersion = '2.15.2';
    expect(app.isApiAvailable(API.freeSpaceAtPath)).toBe(true);
    expect(app.isApiAvailable(API.shareLimitsMode)).toBe(false);
    expect(app.isApiAvailable(API.shareLimitAction)).toBe(true);
  });

  it('gates features on the qBittorrent version', () => {
    const app = useAppStore();
    app.version = '5.1.2';
    expect(app.isFeatureAvailable('5.1.0')).toBe(true);
    expect(app.isFeatureAvailable('5.2.0')).toBe(false);
  });
});

describe('app store session', () => {
  it('checkSession authenticates and records both versions', async () => {
    const app = useAppStore();
    await expect(app.checkSession()).resolves.toBe('authenticated');
    expect(app.version).toBe('5.1.0');
    expect(app.webApiVersion).toBe('2.12.0');
  });

  it('checkSession reports unauthenticated on 403', async () => {
    provider.getVersion.mockRejectedValue(new QbtHttpError(403, ''));
    const app = useAppStore();
    await expect(app.checkSession()).resolves.toBe('unauthenticated');
    expect(app.version).toBeNull();
  });

  it('checkSession rethrows other errors and leaves auth unknown', async () => {
    provider.getVersion.mockRejectedValue(new QbtHttpError(500, ''));
    const app = useAppStore();
    await expect(app.checkSession()).rejects.toBeInstanceOf(QbtHttpError);
    expect(app.auth).toBe('unknown');
    provider.getVersion.mockRejectedValue(new TypeError('network'));
    await expect(app.checkSession()).rejects.toBeInstanceOf(TypeError);
  });

  it('login returns false on bad credentials without loading versions', async () => {
    provider.login.mockResolvedValue(false);
    const app = useAppStore();
    await expect(app.login('a', 'b')).resolves.toBe(false);
    expect(provider.getVersion).not.toHaveBeenCalled();
    expect(app.auth).toBe('unknown');
  });

  it('login authenticates on success', async () => {
    provider.login.mockResolvedValue(true);
    const app = useAppStore();
    await expect(app.login('a', 'b')).resolves.toBe(true);
    expect(app.auth).toBe('authenticated');
    expect(app.webApiVersion).toBe('2.12.0');
  });

  it('login propagates a banned-IP 403', async () => {
    provider.login.mockRejectedValue(new QbtHttpError(403, 'banned'));
    await expect(useAppStore().login('a', 'b')).rejects.toBeInstanceOf(QbtHttpError);
  });

  it('logout clears session state and the torrents store even if the request fails', async () => {
    const app = useAppStore();
    await app.checkSession();
    const reset = vi.spyOn(useTorrentsStore(), 'reset');
    provider.logout.mockRejectedValue(new Error('boom'));
    await expect(app.logout()).rejects.toThrow('boom');
    expect(app.auth).toBe('unauthenticated');
    expect(app.version).toBeNull();
    expect(app.webApiVersion).toBeNull();
    expect(reset).toHaveBeenCalledOnce();
  });
});
