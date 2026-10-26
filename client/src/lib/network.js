import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// One shared, reactive view of connectivity for the whole app, that doesn't trust a flaky signal.
// Going offline is believed at once (the browser's 'offline' event, or navigator.onLine false).
// Coming back is only believed once a request actually gets an answer: navigator.onLine can turn
// true while nothing gets through (DevTools offline, flaky Wi-Fi, captive portals), and saying
// "Back online. Syncing…" then is wrong. So on 'online' we probe /api/health (every second for 15s,
// then backing off); any API response counts too (markReachable, called by api.js). Confirmation fires
// RECONNECTED, which is what the rest of the app listens to instead of 'online'.
export const RECONNECTED = 'noted:reconnected';
const HEALTH = `${(import.meta.env?.VITE_API_URL || '/api').replace(/\/$/, '')}/health`;
const hasWindow = typeof window !== 'undefined';
let reachable = !hasWindow || navigator.onLine;
const subscribers = new Set();
const emit = () => subscribers.forEach((fn) => fn());
// Probing: right away on 'online', then every second for FAST_WINDOW (a real reconnect is confirmed
// within ~1s), then backing off (2s, 4s, … 30s) so a fake "online" (DevTools, captive portal) doesn't
// hammer the server. A new 'online' event, focus, or the tab becoming visible restarts the fast window.
const FAST_WINDOW = 15_000; const FAST_EVERY = 1000; const MAX_DELAY = 30_000; const PROBE_TIMEOUT = 4000;
let probeTimer = null; let fastUntil = 0; let slowDelay = 2000; let inflight = null;

export function markReachable() {
  if (reachable || !navigator.onLine) return;
  reachable = true; stopProbing();
  emit();
  window.dispatchEvent(new Event(RECONNECTED));
}
function stopProbing() { clearTimeout(probeTimer); probeTimer = null; inflight?.abort(); inflight = null; }
function markOffline() {
  stopProbing();
  if (!reachable) return;
  reachable = false; emit();
}
async function probe() {
  probeTimer = null;
  if (reachable || !navigator.onLine) return;
  inflight?.abort();
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  inflight = ctrl;
  const timeout = setTimeout(() => ctrl?.abort(), PROBE_TIMEOUT);
  let ok = false;
  try { ok = (await fetch(HEALTH, { cache: 'no-store', signal: ctrl?.signal })).ok; } catch { /* still unreachable */ }
  clearTimeout(timeout);
  if (inflight !== ctrl) return; // superseded by a newer probe (or stopped)
  inflight = null;
  if (ok) { markReachable(); return; }
  if (reachable || !navigator.onLine) return;
  let delay = FAST_EVERY;
  if (Date.now() >= fastUntil) { delay = slowDelay; slowDelay = Math.min(slowDelay * 2, MAX_DELAY); }
  probeTimer = setTimeout(probe, delay);
}
// Probe now and keep probing every second for a while.
function probeSoon() {
  if (reachable || !navigator.onLine) return;
  fastUntil = Date.now() + FAST_WINDOW; slowDelay = 2000;
  clearTimeout(probeTimer);
  probe();
}
if (hasWindow) {
  window.addEventListener('offline', markOffline);
  window.addEventListener('online', probeSoon);
  window.addEventListener('focus', probeSoon);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') probeSoon(); });
  if (!reachable) probeSoon();
}
const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
// Online for the app: the browser says so AND a request got through since the last time it didn't.
export const isOnline = () => !hasWindow || (navigator.onLine && reachable);
export const useIsOnline = () => useSyncExternalStore(subscribe, isOnline, () => true);

// The messages api.js uses for requests that never got an answer: skipped because the browser is
// offline, or fetch itself failed (DNS, dropped Wi-Fi, blocked) — never the browser's raw
// "Failed to fetch".
export const OFFLINE_MESSAGE = 'You are offline';
export const NETWORK_MESSAGE = 'Couldn’t reach noted. Check your connection and try again.';
export const isNetworkText = (t) => typeof t === 'string' && (t.includes(OFFLINE_MESSAGE) || t.includes(NETWORK_MESSAGE));
export const isNetworkFailure = (e) => e instanceof TypeError || e?.offline === true || e?.network === true;
export const isOfflineError = (e) => e?.offline === true || (e instanceof TypeError && !navigator.onLine);

// Run `fn` when the connection is confirmed back (RECONNECTED). It runs again shortly after too, in
// case the server needs a moment (each run should be idempotent).
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
    window.addEventListener(RECONNECTED, on);
    return () => { window.removeEventListener(RECONNECTED, on); timers.forEach(clearTimeout); };
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
    window.addEventListener(RECONNECTED, onOnline);
    tick();
    return () => { clearTimeout(t); window.removeEventListener(RECONNECTED, onOnline); };
  }, [failing]);
  return useCallback(() => { ref.current(); kick.current(); }, []);
}
