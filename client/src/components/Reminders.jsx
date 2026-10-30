import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { displayTitle } from '../lib/unlocked.js';
import { formatDue, snooze, zoneOf } from '../lib/due.js';
import { showNotification } from '../lib/notify.js';
import { useMinuteTick } from './DueBadge.jsx';

// Reminders that come due while noted. is open (or are already overdue when it opens) show a quiet
// banner under the header and, if allowed, one system notification each. The due list is refreshed on
// load, focus, after any change, and every 5 minutes while visible; a timer fires right on the minute
// for the next one. Per-device state (already notified / dismissed) lives in localStorage, keyed by the
// note and its due time, so changing the time re-arms the reminder.
const STATE_KEY = 'noted.reminders';
const POLL_MS = 5 * 60e3;
const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } };
const writeState = (s) => { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* storage full */ } };
const keyOf = (n) => `${n._id}@${n.dueAt}`;

export default function Reminders() {
  const { user } = useAuth();
  const tz = zoneOf(user);
  const navigate = useNavigate();
  const [notes, setNotes] = useState(null); // null until the first load
  const [state, setState] = useState(readState);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState('');
  useMinuteTick();
  const timer = useRef(0);

  const refresh = useCallback(() => {
    api.dueNotes().then((r) => { setNotes(r.notes || []); setNow(Date.now()); }).catch(() => {}); // offline: keep the last list
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    let debounce = 0;
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 400); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('noted:due-changed', soon);
    window.addEventListener('noted:notes-changed', soon);
    return () => { clearInterval(poll); clearTimeout(debounce); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('noted:due-changed', soon); window.removeEventListener('noted:notes-changed', soon); };
  }, [refresh]);

  // Wake up exactly when the next reminder is due (timers are capped near 24 days by browsers).
  useEffect(() => {
    clearTimeout(timer.current);
    const next = (notes || []).map((n) => Date.parse(n.dueAt)).filter((t) => t > Date.now()).sort((a, b) => a - b)[0];
    if (next) timer.current = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 250, 2 ** 31 - 1));
    return () => clearTimeout(timer.current);
  }, [notes, now]);

  const t = Math.max(now, Date.now());
  const due = (notes || []).filter((n) => n.dueAt && Date.parse(n.dueAt) <= t);

  // One system notification per reminder (per device), and tidy state for reminders that are gone.
  useEffect(() => {
    if (!notes) return; // don't forget what was notified before the list has loaded
    const live = new Set(notes.map(keyOf));
    const next = Object.fromEntries(Object.entries(state).filter(([k]) => live.has(k)));
    let changed = Object.keys(next).length !== Object.keys(state).length;
    for (const n of due) {
      const k = keyOf(n);
      if (next[k]?.notified) continue;
      // A locked note's title never goes to the OS notification centre.
      const title = n.locked ? 'Reminder: a locked note' : `Reminder: ${n.title || 'Untitled'}`;
      // With noted. in front of you the banner is enough; otherwise a system notification too.
      if (!document.hasFocus()) showNotification(title, { body: `Due ${formatDue(n.dueAt, tz)}`, tag: `noted-${n._id}`, onClick: () => navigate(`/notes/${n._id}`) });
      next[k] = { ...next[k], notified: true }; changed = true;
    }
    if (changed) { setState(next); writeState(next); }
  }, [notes, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (n) => { const next = { ...readState(), [keyOf(n)]: { notified: true, dismissed: true } }; setState(next); writeState(next); };
  const act = async (n, dueAt) => {
    setBusy(n._id);
    try { await api.setDue(n._id, dueAt); setNotes((list) => (list || []).map((x) => (x._id === n._id ? { ...x, dueAt } : x)).filter((x) => x.dueAt)); }
    catch { dismiss(n); } // offline: at least get it out of the way here
    finally { setBusy(''); }
  };

  const shown = due.filter((n) => !state[keyOf(n)]?.dismissed);
  if (!shown.length) return null;
  const first = shown.slice(0, 3);
  return (
    <div role="status" aria-live="polite" data-testid="reminder-banner" className="border-b border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 backdrop-blur dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-50 sm:px-4">
      <ul className="mx-auto flex max-w-5xl flex-col gap-1.5">
        {first.map((n) => (
          <li key={n._id} data-testid="reminder-item" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Icon name="bell" size="xs" className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 flex-1 truncate">
              <Link to={`/notes/${n._id}`} className="font-medium underline-offset-2 hover:underline" onClick={() => dismiss(n)}>{n.locked && <Icon name="lock" size="xs" className="-mt-0.5 mr-1 inline" />}{displayTitle(n)}</Link>
              <span className="text-amber-800/80 dark:text-amber-200/80"> · due {formatDue(n.dueAt, tz)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn-ghost btn-sm" disabled={busy === n._id} onClick={() => act(n, snooze())}>Snooze 1h</button>
              <button type="button" className="btn-secondary btn-sm" disabled={busy === n._id} onClick={() => act(n, null)} data-testid="reminder-done"><Icon name="check" size="xs" />Done</button>
              <button type="button" className="btn-ghost btn-icon h-8 w-8" aria-label={`Dismiss reminder for ${displayTitle(n)}`} onClick={() => dismiss(n)}><Icon name="close" size="xs" /></button>
            </span>
          </li>
        ))}
        {shown.length > first.length && <li><Link to="/notes?smart=due" className="text-xs font-medium underline underline-offset-2">{shown.length - first.length} more due · see all reminders</Link></li>}
      </ul>
    </div>
  );
}
