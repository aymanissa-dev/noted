import { useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Asks for a password (optionally twice). onSubmit may throw to show an error.
export default function PasswordDialog({ title, description, confirm = false, submitLabel = 'Continue', onSubmit, onCancel }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useFocusTrap(ref, onCancel);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (confirm && pw.length < 8) return setError('Use at least 8 characters.');
    if (confirm && pw !== pw2) return setError('The passwords don’t match.');
    setBusy(true);
    try { await onSubmit(pw); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div data-modal className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 px-4 dark:bg-black/60" onClick={onCancel}>
      <form ref={ref} role="dialog" aria-modal="true" aria-labelledby="pw-title" tabIndex={-1} onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900">
        <h2 id="pw-title" className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <label className="mt-4 block text-sm font-medium" htmlFor="pw1">Backup password</label>
        <input id="pw1" type="password" autoComplete={confirm ? 'new-password' : 'current-password'} className="input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {confirm && (<>
          <label className="mt-3 block text-sm font-medium" htmlFor="pw2">Repeat password</label>
          <input id="pw2" type="password" autoComplete="new-password" className="input mt-1" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </>)}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !pw}>{busy ? 'Working…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
