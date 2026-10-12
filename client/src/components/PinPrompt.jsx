import { useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Asks for the lock PIN. `onSubmit(pin)` should throw an Error with a message on failure.
export default function PinPrompt({ title = 'This note is locked', description = 'Enter your PIN to view it.', submitLabel = 'Unlock', onSubmit, onCancel, inline = false }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const noTrap = useRef(null);
  useFocusTrap(inline ? noTrap : dialogRef, onCancel);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await onSubmit(pin); } catch (err) { setError(err.message); setPin(''); setBusy(false); }
  };

  const form = (
    <form onSubmit={submit} className="w-full max-w-xs text-center">
      <div className="text-3xl">🔒</div>
      <h2 id="pin-title" className="mt-2 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>
      <input className="input mt-4 text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off"
        pattern="\d{4,6}" maxLength={6} autoFocus required placeholder="••••" aria-label="PIN"
        value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-center gap-2">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" disabled={busy || pin.length < 4}>{busy ? 'Checking…' : submitLabel}</button>
      </div>
    </form>
  );

  if (inline) return <div className="grid place-items-center py-16">{form}</div>;
  return (
    <div data-modal className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 dark:bg-black/60 px-4" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pin-title" tabIndex={-1}
        className="rounded-2xl bg-white dark:bg-stone-900 p-6 shadow-xl outline-none" onClick={(e) => e.stopPropagation()}>{form}</div>
    </div>
  );
}
