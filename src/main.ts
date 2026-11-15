// Must stay the first import: modules below read their storage keys while loading.
import './migrateStorage';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { UNAUTHORIZED_EVENT } from './services/qbit';
import { useAppStore } from './stores/app';
import { applyInitialTheme } from './composables/useTheme';
import { openAdd } from './features/add/addState';
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource-variable/ibm-plex-sans/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';

applyInitialTheme();

const pinia = createPinia();
createApp(App).use(pinia).use(router).use(VueQueryPlugin).mount('#app');

// Any 403 means the session is gone: clear session state and go to login.
window.addEventListener(UNAUTHORIZED_EVENT, () => {
  const app = useAppStore(pinia);
  if (app.auth !== 'authenticated') return;
  app.onLoggedOut();
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }
});

// Installed PWA opened with a .torrent file (manifest file_handlers).
interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
const launchQueue = (
  window as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }
).launchQueue;
launchQueue?.setConsumer(async ({ files }) => {
  if (!files.length) return;
  openAdd({ files: await Promise.all(files.map((f) => f.getFile())) });
});
