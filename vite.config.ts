import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { existsSync } from 'node:fs';

function missingCustomThemeIsNotFound(): Plugin {
  const customThemePath = fileURLToPath(new URL('./public/theme.css', import.meta.url));
  return {
    name: 'missing-custom-theme-is-not-found',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/theme.css' || existsSync(customThemePath))
          return next();
        response.statusCode = 404;
        response.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const QBT = env.VITE_QBT_TARGET ?? 'http://localhost:8080';

  return {
    plugins: [
      vue(),
      tailwindcss(),
      missingCustomThemeIsNotFound(),
      VitePWA({
        registerType: 'autoUpdate',
        // A separate registerSW.js file, not an inline script: qBittorrent's CSP may block inline.
        injectRegister: 'script-defer',
        includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Slake',
          short_name: 'Slake',
          description: 'A fast web UI for qBittorrent',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#090b0d',
          theme_color: '#090b0d',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
          screenshots: [
            {
              src: 'screenshots/wide.png',
              sizes: '1440x900',
              type: 'image/png',
              form_factor: 'wide',
            },
            {
              src: 'screenshots/narrow.png',
              sizes: '780x1688',
              type: 'image/png',
              form_factor: 'narrow',
            },
          ],
          // Clicking a magnet: link opens the add flow (router: /magnet/:uri).
          protocol_handlers: [{ protocol: 'magnet', url: './#/magnet/%s' }],
          // Opening a .torrent file with the installed app (main.ts: launchQueue).
          file_handlers: [{ action: './', accept: { 'application/x-bittorrent': ['.torrent'] } }],
        },
        workbox: {
          // Hashed assets only. index.html is never cached, so a new release is
          // picked up on the next load, and nothing under api/ is ever intercepted.
          globPatterns: ['assets/**/*.{js,css}'],
          navigateFallback: null,
          runtimeCaching: [],
        },
      }),
    ],
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version),
    },
    build: {
      target: 'esnext',
      outDir: mode === 'demo' ? 'qbit-slake-demo' : 'qbit-slake/public',
      emptyOutDir: true,
      // The demo bundles faker's locale data (~400 kB); the real build doesn't include it.
      chunkSizeWarningLimit: mode === 'demo' ? 1000 : 500,
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: QBT,
          changeOrigin: true,
          // Satisfy qBittorrent's CSRF check. VueTorrent instead uses changeOrigin + xfwd
          // and disables host header validation on the dev instance; use whichever works.
          headers: { Origin: QBT, Referer: QBT },
        },
      },
    },
  };
});
