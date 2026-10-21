import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ACCENTS, applyAccent, storedAccent } from '../lib/accent.js';
import { decryptBackup, encryptBackup, isBackup } from '../lib/backup.js';
import PasswordDialog from '../components/PasswordDialog.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import Icon from '../components/Icon.jsx';
import { passwordProblem, PASSWORD_HINT } from '../lib/passwordHints.js';

// If the user has a lock PIN, optionally ask for it so locked notes are included in the export.
// Resolves to the PIN, '' (export locked notes as placeholders), or null (cancelled).
const askPin = async (user, dialog) => {
  if (!user?.hasLockPin) return '';
  const pin = await dialog.prompt({
    title: 'Include locked notes?', body: 'Enter your PIN to include locked notes. Leave it empty to export them as locked placeholders.',
    label: 'PIN', type: 'password', inputMode: 'numeric', maxLength: 6, allowEmpty: true, confirmLabel: 'Export',
    validate: (v) => (v && !/^\d{4,6}$/.test(v) ? 'A PIN is 4 to 6 digits.' : undefined),
  });
  return pin === null ? null : pin;
};

export function Card({ title, description, children, id }) {
  return (
    <section id={id} className="surface scroll-mt-20 p-5 sm:p-7">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
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
      <div role="radiogroup" aria-label="Accent color" className="grid grid-cols-6 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {Object.entries(ACCENTS).map(([key, a]) => (
          <button key={key} type="button" role="radio" aria-checked={current === key} aria-label={a.label} title={a.label} onClick={() => choose(key)}
            className={`mx-auto aspect-square w-full max-w-11 rounded-full transition sm:mx-0 sm:h-8 sm:w-8 sm:max-w-none ${current === key ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100 ring-offset-white dark:ring-offset-stone-900' : 'hover:scale-110'}`}
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
  const [checkedAt, setCheckedAt] = useState(null);
  // Keep it current: on open, when you come back to the tab, every 30s while visible, and after
  // session changes (sign out everywhere, password change).
  useEffect(() => {
    let alive = true;
    const load = () => api.loginActivity()
      .then(({ events }) => { if (alive) { setEvents(events); setError(''); setCheckedAt(Date.now()); } })
      .catch((e) => alive && setError(e.message));
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('noted:sessions-changed', load);
    return () => {
      alive = false; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('noted:sessions-changed', load);
    };
  }, []);
  const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card title="Login activity" description="Your last 20 sign-ins. IP addresses are masked. If something looks unfamiliar, change your password and sign out everywhere.">
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {!events && !error && <p className="text-sm text-muted">Loading…</p>}
      {events && (
        <ul data-testid="activity" className="-mx-2 divide-y divide-stone-100 dark:divide-stone-800">
          {events.map((e) => (
            <li key={e._id} className="flex items-start gap-3 px-2 py-2.5 text-sm">
              <Icon name={e.device === 'mobile' ? 'phone' : e.device === 'tablet' ? 'tablet' : 'laptop'} className="mt-0.5 text-stone-500 dark:text-stone-400" />
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
      {checkedAt && <p className="mt-2 text-xs text-faint" data-testid="activity-checked">Updated {new Date(checkedAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}</p>}
    </Card>
  );
}

function DataSection() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null); // { encrypt: pin } | { backup } (decrypt)
  const dialog = useDialog();
  const withPin = async (fn) => { const pin = await askPin(user, dialog); if (pin !== null) fn(pin || undefined); };

  const report = ({ imported, skippedDuplicates = 0, skippedLocked = 0 }) => {
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const parts = [`Imported ${plural(imported, 'note')}.`];
    if (skippedDuplicates) parts.push(`Skipped ${plural(skippedDuplicates, 'duplicate')} you already have.`);
    if (skippedLocked) parts.push(`Skipped ${plural(skippedLocked, 'locked note')} without content.`);
    setMsg({ text: parts.join(' ') });
    window.dispatchEvent(new Event('noted:folders-changed'));
  };

  const makeBackup = async (password) => {
    const data = await api.exportData(modal.encrypt);
    const file = await encryptBackup(data, password);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `noted-${new Date().toISOString().slice(0, 10)}.noted-backup` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setModal(null);
    setMsg({ text: `Encrypted backup of ${data.notes.length} notes downloaded. Keep the password safe: it can’t be recovered.` });
  };
  const restoreBackup = async (password) => {
    const data = await decryptBackup(modal.backup, password);
    const result = await api.importNotes(data);
    setModal(null); report(result);
  };

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
      try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not a noted. export or backup.'); }
      if (isBackup(data)) { setModal({ backup: data }); return; }
      report(await api.importNotes(data));
    });
  };

  return (
    <Card title="Your data" description="Download a copy of your notes, or import a noted. JSON export or encrypted backup. Trashed notes are not exported; locked notes are included only if you enter your PIN.">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:w-full [&>button]:px-3 sm:[&>button]:w-auto sm:[&>button]:px-4">
        <button className="btn-secondary" disabled={busy} onClick={() => withPin((pin) => run(() => api.exportJson(pin)))}><Icon name="download" />Export JSON</button>
        <button className="btn-secondary" disabled={busy} onClick={() => withPin((pin) => run(() => api.exportMarkdown(pin)))}><Icon name="download" />Markdown (.zip)</button>
        <button className="btn-secondary" disabled={busy} onClick={() => withPin((pin) => setModal({ encrypt: pin }))}><Icon name="lock" />Encrypted backup…</button>
        <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" />Import…</button>
        <input ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json,.noted-backup" className="hidden" onChange={onImport} />
      </div>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.error ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{msg.text}</p>}
      {modal && 'encrypt' in modal && <PasswordDialog confirm title="Encrypted backup" submitLabel="Encrypt & download"
        description="Your notes are encrypted on this device (AES-256) with a password you choose. Without it the backup can’t be opened."
        onSubmit={makeBackup} onCancel={() => setModal(null)} />}
      {modal?.backup && <PasswordDialog title="Restore encrypted backup" submitLabel="Decrypt & import"
        description="Enter the password you used for this backup. Notes you already have are skipped."
        onSubmit={restoreBackup} onCancel={() => setModal(null)} />}
    </Card>
  );
}

function PasswordSection() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    const weak = passwordProblem(form.next, { email: user?.email, name: user?.name });
    if (weak) return setMsg({ error: true, text: weak });
    if (form.next !== form.confirm) return setMsg({ error: true, text: 'New passwords do not match.' });
    setBusy(true);
    try {
      await api.changePassword(form.current, form.next);
      window.dispatchEvent(new Event('noted:sessions-changed'));
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ text: 'Password updated. Other devices have been signed out.' });
    } catch (err) { setMsg({ error: true, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" required value={form.current} onChange={set('current')} />
        <input className="input" type="password" placeholder="New password" autoComplete="new-password" required value={form.next} onChange={set('next')} aria-describedby="pw-hint" />
        <p id="pw-hint" className="field-hint">{PASSWORD_HINT} We also check it against known data breaches (only a partial hash leaves our server).</p>
        <input className="input" type="password" placeholder="Confirm new password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
        {msg && <p className={`text-sm ${msg.error ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{msg.text}</p>}
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
    <Card id="lock-pin" title="Note lock PIN" description="Lock individual notes behind a 4–6 digit PIN. Locked notes are hidden in lists, search, and offline storage until you enter it.">
      {!mode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted">{user?.hasLockPin ? 'PIN is set.' : 'No PIN set.'}</span>
          <button className="btn-secondary" onClick={() => { setMode('set'); setMsg(null); }}>{user?.hasLockPin ? 'Change PIN' : 'Set PIN'}</button>
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
          {mode === 'remove' && <p className="text-sm text-muted">All locked notes will be unlocked.</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
            <button className={mode === 'remove' ? 'btn-danger-solid' : 'btn-primary'} disabled={busy}>
              {busy ? 'Saving…' : mode === 'remove' ? 'Remove PIN' : 'Save PIN'}
            </button>
          </div>
        </form>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{msg.text}</p>}
    </Card>
  );
}

function SessionsSection() {
  const dialog = useDialog();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!(await dialog.confirm({ title: 'Sign out other devices?', body: 'Every other browser and device will need to log in again. You stay signed in here.', confirmLabel: 'Sign out others' }))) return;
    setBusy(true); setMsg(null);
    try { await api.logoutAll(); window.dispatchEvent(new Event('noted:sessions-changed')); setMsg({ text: 'Signed out everywhere else. You’re still signed in here.' }); }
    catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Card title="Sessions" description="Lost a device or used a shared computer? Sign out everywhere except this browser.">
      <button className="btn-secondary" disabled={busy} onClick={run}>{busy ? 'Signing out…' : 'Sign out of all other devices'}</button>
      {msg && <p className={`mt-3 text-sm ${msg.error ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{msg.text}</p>}
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
          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }}>Cancel</button>
            <button className="btn-danger-solid" disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete account and notes'}</button>
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
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">{user?.name} · {user?.email}</p>
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
