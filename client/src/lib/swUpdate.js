// Service worker updates, promptly and safely.
// Page loads are network-first in the worker (see vite.config.js), so a load while online always gets
// the current build. An already open tab still runs the build it started with. The worker itself activates new builds immediately (skipWaiting +
// clientsClaim, versioned precache with old caches cleaned up); this file makes the page follow:
//  - checks for a new worker on start, when the tab becomes visible or the window gets focus, and
//    every 20 minutes (see data-sw-checked / data-sw-update on <html>);
//  - when a new worker takes control, reloads right away if no note is open in the editor;
//  - with a note open, shows a "new version" toast (via an event the app listens to) and reloads
//    on its own as soon as you leave the editor, so typing is never interrupted;
//  - if a lazy chunk of the old build is gone (Vite preload error), reloads into the new one.
const editorOpen = () => Boolean(document.querySelector('[data-testid=md-editor]'));

export function startServiceWorker() {
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); window.location.reload(); });
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const sw = navigator.serviceWorker;
  // The first controller this page gets (first install, claimed via clientsClaim) is the build it is
  // already running: nothing to refresh. Every controller change after that is a new build.
  let controlled = Boolean(sw.controller);
  let reloading = false;
  const reload = () => { if (!reloading) { reloading = true; window.location.reload(); } };
  sw.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    console.info('[noted] new version active, reloading', editorOpen() ? 'after you leave this note' : 'now');
    if (!editorOpen()) { reload(); return; }
    window.dispatchEvent(new CustomEvent('noted:update-ready', { detail: { apply: reload } }));
    const t = setInterval(() => { if (!editorOpen()) { clearInterval(t); reload(); } }, 1500);
  });
  window.addEventListener('load', () => {
    sw.register('/sw.js', { scope: '/' }).then((reg) => {
      // Observable for QA/tests: <html data-sw-checked> is the time of the last check, data-sw-update
      // is "found" once a newer build is installing, and each check logs to the console.
      const root = document.documentElement;
      reg.addEventListener('updatefound', () => { root.dataset.swUpdate = 'found'; console.info('[noted] new version found, installing'); });
      let last = 0;
      const check = (why) => {
        if (!navigator.onLine || document.visibilityState !== 'visible') return;
        const burst = why === 'tab visible' || why === 'window focus'; // these can fire in bursts
        if (burst && Date.now() - last < 30000) return;
        if (burst) last = Date.now();
        root.dataset.swChecked = new Date().toISOString();
        console.info(`[noted] checking for a new version (${why}; running ${root.dataset.build})`);
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => check('tab visible'));
      window.addEventListener('focus', () => check('window focus'));
      window.addEventListener('noted:check-update', () => check('requested'));
      setInterval(() => check('every 20 min'), 20 * 60 * 1000);
      check('page load'); // don't rely on the browser's own post-navigation check
    }).catch(() => {});
  });
}
