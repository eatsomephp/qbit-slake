import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import qbit, { QbtHttpError } from '@/services/qbit';
import { compareVersions } from '@/lib/version';
import { useTorrentsStore } from './torrents';

export const MIN_QBT_VERSION = '5.0.0';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

export const useAppStore = defineStore('app', () => {
  const auth = ref<AuthStatus>('unknown');
  const version = ref<string | null>(null);
  const webApiVersion = ref<string | null>(null);

  const isVersionSupported = computed(
    () => version.value !== null && compareVersions(version.value, MIN_QBT_VERSION) >= 0,
  );

  async function loadVersions() {
    [version.value, webApiVersion.value] = await Promise.all([
      qbit.getVersion(),
      qbit.getWebApiVersion(),
    ]);
  }

  /**
   * Probes the session with a cheap authenticated call. Resolves to the new status;
   * network errors propagate so callers can show "can't reach qBittorrent".
   */
  async function checkSession(): Promise<AuthStatus> {
    try {
      await loadVersions();
      auth.value = 'authenticated';
    } catch (err) {
      if (!(err instanceof QbtHttpError && err.status === 403)) throw err;
      auth.value = 'unauthenticated';
    }
    return auth.value;
  }

  /** Resolves false on wrong credentials. Throws QbtHttpError(403) when the IP is banned. */
  async function login(username: string, password: string): Promise<boolean> {
    if (!(await qbit.login(username, password))) return false;
    await loadVersions();
    auth.value = 'authenticated';
    return true;
  }

  async function logout() {
    try {
      await qbit.logout();
    } finally {
      onLoggedOut();
    }
  }

  /** Called on logout and on any 403: forget everything tied to the session. */
  function onLoggedOut() {
    auth.value = 'unauthenticated';
    version.value = null;
    webApiVersion.value = null;
    useTorrentsStore().reset();
  }

  function isFeatureAvailable(minVersion: string): boolean {
    return version.value !== null && compareVersions(version.value, minVersion) >= 0;
  }

  /** Prefer this for request/response shapes: WebAPI versions track them exactly. */
  function isApiAvailable(minApiVersion: string): boolean {
    return webApiVersion.value !== null && compareVersions(webApiVersion.value, minApiVersion) >= 0;
  }

  return {
    auth,
    version,
    webApiVersion,
    isVersionSupported,
    checkSession,
    login,
    logout,
    onLoggedOut,
    isFeatureAvailable,
    isApiAvailable,
  };
});
