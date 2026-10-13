import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ACCENTS, applyAccent, storedAccent } from '../lib/accent.js';

// If the user has a lock PIN, optionally ask for it so locked notes are included in the export.
const askPin = (user) => {
  if (!user?.hasLockPin) return undefined;
  const pin = window.prompt('Enter your PIN to include locked notes, or leave empty to export them as locked placeholders.');
  return pin && /^\d{4,6}$/.test(pin.trim()) ? pin.trim() : undefined;
};

export function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AccentSection() {
  const { user, updateUser } = useAuth();
  const [current, setCurrent] = useState(user?.preferences?.accent || storedAccent());
  const [msg, setMsg] = useState('');
  const choose = async (key) => {
    const prev = current;
    setCurrent(key); applyAccent(key); setMsg('');
    try { const { user: u } = await api.updatePreferences({ accent: key }); updateUser(u); }
    catch (e) { setMsg(`Saved on this device only (${e.message}).`); if (!navigator.onLine) return; setCurrent(prev); applyAccent(prev); }
  };
  return (
    <Card title="Accent color" description="Used for the logo dot, highlights, and focus rings. Synced to your account.">
      <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-3">
        {Object.entries(ACCENTS).map(([key, a]) => (
          <button key={key} type="button" role="radio" aria-checked={current === key} aria-label={a.label} title={a.label} onClick={() => choose(key)}
            className={`h-8 w-8 rounded-full transition ${current === key ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100 ring-offset-white dark:ring-offset-stone-900' : 'hover:scale-110'}`}
            style={{ background: `rgb(${a.rgb})` }} />
        ))}
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </Card>
  );
}

function ActivitySection() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.loginActivity().then(({ events }) => setEvents(events)).catch((e) => setError(e.message)); }, []);
  const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card title="Login activity" description="Your last 20 sign-ins. IP addresses are masked. If something looks unfamiliar, change your password and sign out everywhere.">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!events && !error && <p className="text-sm text-muted">Loading…</p>}
      {events && (
        <ul data-testid="activity" className="-mx-2 divide-y divide-stone-100 dark:divide-stone-800">
          {events.map((e) => (
            <li key={e._id} className="flex items-start gap-3 px-2 py-2.5 text-sm">
              <span aria-hidden="true" className="mt-0.5 text-base">{e.device === 'mobile' ? '📱' : e.device === 'tablet' ? '📲' : '💻'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{e.browser} on {e.os}
                  {e.current && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">This device</span>}
                  {!e.current && !e.active && <span className="ml-2 text-xs text-faint">Signed out</span>}
                </p>
                <p className="truncate text-xs text-muted">{when(e.at)}{e.kind === 'register' ? ' · account created' : ''}{e.location ? ` · ${e.location}` : ''}{e.ip ? ` · ${e.ip}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DataSection() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };

  const onImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON.'); }
      const { imported, skippedDuplicates = 0, skippedLocked = 0 } = await api.importNotes(data);
      const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      const parts = [`Imported ${plural(imported, 'note')}.`];
      if (skippedDuplicates) parts.push(`Skipped ${plural(skippedDuplicates, 'duplicate')} you already have.`);
      if (skippedLocked) parts.push(`Skipped ${plural(skippedLocked, 'locked note')} without content.`);
      setMsg({ text: parts.join(' ') });
    });
  };

  return (
    <Card title="Your data" description="Download a copy of your notes, or import notes from a noted. JSON export. Trashed notes are not exported; locked notes are included only if you enter your PIN.">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(() => api.exportJson(askPin(user)))}>Export JSON</button>
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(() => api.exportMarkdown(askPin(user)))}>Export Markdown (.zip)</button>
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => fileRef.current?.click()}>Import JSON…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
    </Card>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    if (form.next.length < 8) return setMsg({ error: true, text: 'New password must be at least 8 characters.' });
    if (form.next !== form.confirm) return setMsg({ error: true, text: 'New passwords do not match.' });
    setBusy(true);
    try {
      await api.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ text: 'Password updated. Other devices have been signed out.' });
    } catch (err) { setMsg({ error: true, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" required value={form.current} onChange={set('current')} />
        <input className="input" type="password" placeholder="New password (min 8 characters)" autoComplete="new-password" required value={form.next} onChange={set('next')} />
        <input className="input" type="password" placeholder="Confirm new password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
        {msg && <p className={`text-sm ${msg.error ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
      </form>
    </Card>
  );
}

function LockPinSection() {
  const { user, updateUser } = useAuth();
  const [mode, setMode] = useState(null); // 'set' | 'remove'
  const [form, setForm] = useState({ password: '', pin: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'password' ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6) });
  const close = () => { setMode(null); setForm({ password: '', pin: '', confirm: '' }); };

  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    if (mode === 'set') {
      if (!/^\d{4,6}$/.test(form.pin)) return setMsg({ error: true, text: 'PIN must be 4 to 6 digits.' });
      if (form.pin !== form.confirm) return setMsg({ error: true, text: 'PINs do not match.' });
    }
    setBusy(true);
    try {
      if (mode === 'set') {
        const { user: u } = await api.setLockPin(form.password, form.pin);
        updateUser(u); setMsg({ text: user?.hasLockPin ? 'PIN changed.' : 'PIN set. You can now lock notes from the editor.' });
      } else {
        const { user: u, unlockedNotes } = await api.removeLockPin(form.password);
        updateUser(u); setMsg({ text: `PIN removed. ${unlockedNotes} note${unlockedNotes === 1 ? ' was' : 's were'} unlocked.` });
      }
      close();
    } catch (err) { setMsg({ error: true, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <Card title="Note lock PIN" description="Lock individual notes behind a 4–6 digit PIN. Locked notes are hidden in lists, search, and offline storage until you enter it.">
      {!mode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-stone-500 dark:text-stone-400">{user?.hasLockPin ? 'PIN is set.' : 'No PIN set.'}</span>
          <button className="btn-ghost border border-stone-300 dark:border-stone-700" onClick={() => { setMode('set'); setMsg(null); }}>{user?.hasLockPin ? 'Change PIN' : 'Set PIN'}</button>
          {user?.hasLockPin && <button className="btn-danger" onClick={() => { setMode('remove'); setMsg(null); }}>Remove PIN</button>}
        </div>
      )}
      {mode && (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="password" placeholder="Account password" autoComplete="current-password" required autoFocus value={form.password} onChange={set('password')} />
          {mode === 'set' && <>
            <input className="input font-mono tracking-widest" type="password" inputMode="numeric" placeholder="New PIN (4–6 digits)" autoComplete="off" required value={form.pin} onChange={set('pin')} />
            <input className="input font-mono tracking-widest" type="password" inputMode="numeric" placeholder="Confirm PIN" autoComplete="off" required value={form.confirm} onChange={set('confirm')} />
          </>}
          {mode === 'remove' && <p className="text-sm text-stone-500 dark:text-stone-400">All locked notes will be unlocked.</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
            <button className={mode === 'remove' ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} disabled={busy}>
              {busy ? 'Saving…' : mode === 'remove' ? 'Remove PIN' : 'Save PIN'}
            </button>
          </div>
        </form>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
    </Card>
  );
}

function SessionsSection() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!window.confirm('Sign out of noted. on every other device and browser?')) return;
    setBusy(true); setMsg(null);
    try { await api.logoutAll(); setMsg({ text: 'Signed out everywhere else. You’re still signed in here.' }); }
    catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Card title="Sessions" description="Lost a device or used a shared computer? Sign out everywhere except this browser.">
      <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={run}>{busy ? 'Signing out…' : 'Sign out of all other devices'}</button>
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
    </Card>
  );
}

function DeleteAccountSection() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.deleteAccount(password); logout({ flash: 'Your account and all of your notes were deleted.' }); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Card title="Delete account" description="Permanently delete your account and all of your notes. This can't be undone. Consider exporting first.">
      {!open ? (
        <button className="btn-danger border border-red-200 dark:border-red-900" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="password" placeholder="Enter your password to confirm" autoComplete="current-password" required autoFocus disabled={busy}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }}>Cancel</button>
            <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete account and notes'}</button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">{user?.name} · {user?.email}</p>
        <Link to="/stats" className="mt-2 inline-block text-sm underline-offset-4 hover:underline">View storage stats →</Link>
      </div>
      <AccentSection />
      <DataSection />
      <LockPinSection />
      <ActivitySection />
      <PasswordSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}
