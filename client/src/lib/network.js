import { useEffect, useRef, useSyncExternalStore } from 'react';

// One shared, reactive view of connectivity for the whole app. Components re-render on the
// browser's online/offline events, so nothing keeps saying "You are offline" after you reconnect.
const subscribe = (fn) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
};
const snapshot = () => navigator.onLine;
export const useIsOnline = () => useSyncExternalStore(subscribe, snapshot, () => true);

// The message api.js uses when a request is skipped because the browser is offline.
export const OFFLINE_MESSAGE = 'You are offline';
export const isOfflineError = (e) => e?.offline === true || (e instanceof TypeError && !navigator.onLine);

// Run `fn` when the connection comes back. The 'online' event can fire a moment before requests
// actually get through, so it runs again shortly after (each run should be idempotent).
export function useOnReconnect(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timers = [];
    const on = () => {
      timers.forEach(clearTimeout);
      ref.current();
      timers = [800, 2500].map((ms) => setTimeout(() => { if (navigator.onLine) ref.current(); }, ms));
    };
    window.addEventListener('online', on);
    return () => { window.removeEventListener('online', on); timers.forEach(clearTimeout); };
  }, []);
}

// Drop a message that only said we were offline (string or { text }) once we're back online.
const mentionsOffline = (v) => typeof (v?.text ?? v) === 'string' && (v?.text ?? v).includes(OFFLINE_MESSAGE);
export function useClearOfflineMessage(setter) {
  useOnReconnect(() => setter((v) => (mentionsOffline(v) ? (typeof v === 'string' ? '' : null) : v)));
}
