import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// One shared, reactive view of connectivity for the whole app. Components re-render on the
// browser's online/offline events, so nothing keeps saying "You are offline" after you reconnect.
const subscribe = (fn) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
};
const snapshot = () => navigator.onLine;
export const useIsOnline = () => useSyncExternalStore(subscribe, snapshot, () => true);

// The messages api.js uses for requests that never got an answer: skipped because the browser is
// offline, or fetch itself failed (DNS, dropped Wi-Fi, blocked) — never the browser's raw
// "Failed to fetch".
export const OFFLINE_MESSAGE = 'You are offline';
export const NETWORK_MESSAGE = 'Couldn’t reach noted. Check your connection and try again.';
export const isNetworkText = (t) => typeof t === 'string' && (t.includes(OFFLINE_MESSAGE) || t.includes(NETWORK_MESSAGE));
export const isNetworkFailure = (e) => e instanceof TypeError || e?.offline === true || e?.network === true;
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
const mentionsOffline = (v) => typeof (v?.text ?? v) === 'string' && [OFFLINE_MESSAGE, NETWORK_MESSAGE].some((m) => (v?.text ?? v).includes(m));
export function useClearOfflineMessage(setter) {
  useOnReconnect(() => setter((v) => (mentionsOffline(v) ? (typeof v === 'string' ? '' : null) : v)));
}

// Keep a data view fresh after connection trouble. Calls `load`:
//  - when the browser comes back online (plus two short retries, see useOnReconnect);
//  - when the window regains focus or the tab becomes visible (always, or only while failing);
//  - while `failing`, on a backoff (1s after reconnecting or Try again, else 3s; doubling up to 30s)
//    as long as the tab is visible and the browser thinks it's online. A request can fail with
//    "Failed to fetch" while navigator.onLine stays true (flaky Wi-Fi, captive portals, DevTools
//    throttling), and then no 'online' event ever comes, so waiting for one isn't enough. The
//    backoff only grows after a real attempt, so a long time offline doesn't leave a 30s gap
//    after the connection returns.
// Returns `retry()`: load now and keep retrying quickly while it still fails (one Try again click is
// enough even if the network needs a few more seconds).
export function useRefetch(load, { failing = false, onFocus = 'failing' } = {}) {
  const ref = useRef(load);
  ref.current = load;
  const failingRef = useRef(failing);
  failingRef.current = failing;
  const kick = useRef(() => {});
  useOnReconnect(() => ref.current());
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && (onFocus === 'always' || failingRef.current)) ref.current(); };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => { window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); };
  }, [onFocus]);
  useEffect(() => {
    if (!failing) { kick.current = () => {}; return undefined; }
    let delay = 3000; let t;
    const tick = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) { ref.current(); delay = Math.min(delay * 2, 30000); }
        tick();
      }, delay);
    };
    kick.current = () => { delay = 1000; tick(); };
    const onOnline = () => kick.current();
    window.addEventListener('online', onOnline);
    tick();
    return () => { clearTimeout(t); window.removeEventListener('online', onOnline); };
  }, [failing]);
  return useCallback(() => { ref.current(); kick.current(); }, []);
}
