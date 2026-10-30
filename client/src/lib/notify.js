// Browser notifications for reminders. Permission is asked at most once per device, and only from a
// user action (setting a reminder or the Settings button); after that the in-app banner still works.
const ASKED = 'noted.notifyAsked';
export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifyPermission = () => (notifySupported() ? Notification.permission : 'unsupported');

export async function askNotifyOnce({ force = false } = {}) {
  if (!notifySupported() || Notification.permission !== 'default') return notifyPermission();
  try { if (!force && localStorage.getItem(ASKED)) return 'default'; localStorage.setItem(ASKED, '1'); } catch { /* private mode */ }
  try { return await Notification.requestPermission(); } catch { return notifyPermission(); }
}

// Show a system notification; clicking it focuses noted. and runs onClick. Falls back to the service
// worker where `new Notification` isn't allowed (Android Chrome).
export function showNotification(title, { body, tag, onClick } = {}) {
  if (notifyPermission() !== 'granted') return false;
  const opts = { body, tag, icon: '/pwa-192x192.png', badge: '/favicon.png', renotify: false };
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    return true;
  } catch {
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {});
    return true;
  }
}
