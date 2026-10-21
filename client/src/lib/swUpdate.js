// Service worker updates, promptly and safely.
// The worker precaches the app shell, so after a deploy an open tab (or a normal reload) could keep
// running the previous build. The worker itself activates new builds immediately (skipWaiting +
// clientsClaim, versioned precache with old caches cleaned up); this file makes the page follow:
//  - checks for a new worker on start, whenever the tab becomes visible, and every 20 minutes;
//  - when a new worker takes control, reloads right away if no note is open in the editor;
//  - with a note open, shows a "new version" toast (via an event the app listens to) and reloads
//    on its own as soon as you leave the editor, so typing is never interrupted;
//  - if a lazy chunk of the old build is gone (Vite preload error), reloads into the new one.
const editorOpen = () => Boolean(document.querySelector('[data-testid=md-editor]'));

export function startServiceWorker() {
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); window.location.reload(); });
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const sw = navigator.serviceWorker;
  const hadController = Boolean(sw.controller); // no controller = first install: nothing to refresh
  let reloading = false;
  const reload = () => { if (!reloading) { reloading = true; window.location.reload(); } };
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!editorOpen()) { reload(); return; }
    window.dispatchEvent(new CustomEvent('noted:update-ready', { detail: { apply: reload } }));
    const t = setInterval(() => { if (!editorOpen()) { clearInterval(t); reload(); } }, 1500);
  });
  window.addEventListener('load', () => {
    sw.register('/sw.js', { scope: '/' }).then((reg) => {
      const check = () => { if (navigator.onLine && document.visibilityState === 'visible') reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', check);
      setInterval(check, 20 * 60 * 1000);
    }).catch(() => {});
  });
}
