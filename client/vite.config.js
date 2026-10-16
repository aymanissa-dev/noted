import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        navigateFallbackDenylist: [/^\/api\//],
        // Never serve API responses from the SW cache (they are per-user and must be fresh).
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
      },
    }),
  ],
});
