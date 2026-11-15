import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalized,
  type RouterHistory,
} from 'vue-router';
import { useAppStore } from '@/stores/app';
import { openAdd } from '@/features/add/addState';

// Hash history is required: qBittorrent serves static files and does not fall back
// to index.html, so /settings would 404 on refresh.
export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'main',
        component: () => import('@/features/MainView.vue'),
        children: [
          {
            path: 'settings/:section?',
            name: 'settings',
            component: () => import('@/features/settings/SettingsView.vue'),
          },
          {
            path: 'rss/:tab(rules)?',
            name: 'rss',
            component: () => import('@/features/rss/RssView.vue'),
          },
          {
            path: 'search/:tab(plugins)?',
            name: 'search',
            component: () => import('@/features/search/SearchView.vue'),
          },
          {
            path: 'creator',
            name: 'creator',
            component: () => import('@/features/creator/TorrentCreatorView.vue'),
          },
          {
            path: 'log/:tab(peers)?',
            name: 'log',
            component: () => import('@/features/log/LogView.vue'),
          },
        ],
      },
      {
        // PWA protocol handler target: ./#/magnet/%s. Opens the add dialog, then the list.
        path: '/magnet/:uri(.*)',
        name: 'magnet',
        component: () => import('@/features/MainView.vue'),
        beforeEnter: (to) => {
          openAdd({ text: decodeMagnetParam(to.params.uri) });
          return { name: 'main' };
        },
      },
      { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue') },
      {
        path: '/shutdown',
        name: 'shutdown',
        component: () => import('@/features/auth/ShutdownView.vue'),
      },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  });
  router.beforeEach(authGuard);
  return router;
}

export const router = createAppRouter();

async function authGuard(to: RouteLocationNormalized) {
  if (to.name === 'shutdown') return true;
  const app = useAppStore();
  if (app.auth === 'unknown') {
    try {
      await app.checkSession();
    } catch {
      // Can't reach qBittorrent: the login view shows the error and lets the user retry.
      return to.name === 'login' ? true : { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  if (to.name === 'login') {
    return app.auth === 'authenticated' ? safeRedirect(to.query.redirect) : true;
  }
  if (app.auth !== 'authenticated') {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
}

/** Only accept in-app paths as redirect targets. */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

/** The handler URL carries the magnet percent-encoded, sometimes twice. */
export function decodeMagnetParam(value: unknown): string {
  let text = Array.isArray(value) ? value.join('/') : String(value ?? '');
  for (let i = 0; i < 3 && /^magnet%/i.test(text); i++) {
    try {
      text = decodeURIComponent(text);
    } catch {
      break;
    }
  }
  return text;
}
