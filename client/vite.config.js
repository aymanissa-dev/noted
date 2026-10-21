import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
          { name: 'New note', short_name: 'New', url: '/notes/new', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Archive', url: '/archive' },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; SPA routes fall back to index.html offline.
        // API responses are NOT cached by the service worker (they are per-user); the app keeps
        // its own offline copy in localStorage, cleared on logout.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true, // drop the previous build's precache once the new worker is active
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        // No runtime route for /api: those requests bypass the service worker entirely, so they are never
        // cached and, offline, fail in the page as a normal network error (which the app queues/handles)
        // instead of a NetworkOnly "no-response" rejection logged by the worker.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
      },
    }),
  ],
});
