import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import changelogFeeds from './build/changelogFeeds.js';

// Security headers (CSP etc.) live in vercel.json; `vite preview` serves the same ones so local QA
// runs under the production policy. Locally the API is another origin, so it's added to connect-src.
const securityHeaders = () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = vercel.headers.find((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'));
  const api = process.env.VITE_API_URL ? new URL(process.env.VITE_API_URL).origin : '';
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key, key === 'Content-Security-Policy' && api ? value.replace("connect-src 'self'", `connect-src 'self' ${api}`) : value]));
};

// Which build is this? Shown in Settings and on <html data-build>, so QA can tell a stale cached app
// from the deployed one. Vercel git builds set VERCEL_GIT_COMMIT_SHA; CLI builds fall back to git/time.
const sha = () => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const BUILD_ID = process.env.VITE_BUILD_ID || (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || sha() || 'dev';
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  preview: { headers: securityHeaders() },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [
    react(),
    changelogFeeds(), // /changelog.xml + /changelog.json from src/data/changelog.js
    VitePWA({
      // New builds activate immediately (skipWaiting + clientsClaim). Registration and the page-side
      // reload (right away, or once you leave an open note) live in src/lib/swUpdate.js.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'noted.',
        short_name: 'noted.',
        description: 'Write it down. Find it later.',
        theme_color: '#1c1917',
        background_color: '#fafaf9',
        display: 'standalone',
        start_url: '/notes',
        scope: '/',
        shortcuts: [
          { name: 'New note', short_name: 'New', url: '/notes/new', icons: [{ src: '/shortcut-new-96x96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Archive', url: '/archive', icons: [{ src: '/shortcut-archive-96x96.png', sizes: '96x96', type: 'image/png' }] },
        ],
        // Install-dialog previews (richer install UI). WebP, so they stay out of the precache.
        screenshots: [
          { src: '/screenshots/notes-wide.webp', sizes: '1280x800', type: 'image/webp', form_factor: 'wide', label: 'Your notes, folders and tags' },
          { src: '/screenshots/notes-narrow.webp', sizes: '780x1688', type: 'image/webp', form_factor: 'narrow', label: 'Your notes on your phone' },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Page loads (navigations) are NETWORK-FIRST: online, every load gets the current index.html
        // from the server, so a tab never starts on an older build just because an older worker is
        // still in control (QA saw a profile two builds behind start on the stale shell). Every route
        // is the same SPA shell, so all navigations share one cache entry (/index.html), refreshed on
        // each online load; offline (or no answer within 4s) that copy is used, and if there's none
        // yet, the precached index.html.
        // API responses are NOT cached by the service worker (they are per-user); the app keeps
        // its own offline copy in localStorage, cleared on logout.
        navigateFallback: null,
        // index.html stays precached (the offline fallback), but '/' must not be served from the
        // precache (cache-first) by Workbox's directory-index matching: send it to the route below.
        directoryIndex: '__no_directory_index__',
        runtimeCaching: [{
          urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'noted-shell',
            networkTimeoutSeconds: 4,
            plugins: [{
              cacheKeyWillBeUsed: async () => '/index.html',
              cacheWillUpdate: async ({ response }) => (response && response.status === 200 && (response.headers.get('content-type') || '').includes('text/html') ? response : null),
              handlerDidError: async () => caches.match('/index.html', { ignoreSearch: true }),
            }],
          },
        }],
        cleanupOutdatedCaches: true, // drop the previous build's precache once the new worker is active
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        // No runtime route for /api: those requests bypass the service worker entirely, so they are never
        // cached and, offline, fail in the page as a normal network error (which the app queues/handles)
        // instead of a NetworkOnly "no-response" rejection logged by the worker.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
        // The ZIP library is only used by the (online-only) Markdown export: not worth precaching.
        globIgnores: ['**/jszip*.js'],
      },
    }),
  ],
});
