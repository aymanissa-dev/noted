import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataSection() {
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
      const { imported } = await api.importNotes(data);
      setMsg({ text: `Imported ${imported} note${imported === 1 ? '' : 's'}.` });
    });
  };

  return (
    <Card title="Your data" description="Download a copy of your notes, or import notes from a noted. JSON export. Trashed notes are not exported.">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(api.exportJson)}>Export JSON</button>
        <button className="btn-ghost border border-stone-300 dark:border-stone-700" disabled={busy} onClick={() => run(api.exportMarkdown)}>Export Markdown (.zip)</button>
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
    try { await api.deleteAccount(password); logout(); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Card title="Delete account" description="Permanently delete your account and all of your notes. This can't be undone. Consider exporting first.">
      {!open ? (
        <button className="btn-danger border border-red-200 dark:border-red-900" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="password" placeholder="Enter your password to confirm" autoComplete="current-password" required autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setPassword(''); setError(''); }}>Cancel</button>
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
      </div>
      <DataSection />
      <PasswordSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}
