import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Asks for the lock PIN. `onSubmit(pin)` should throw an Error with a message on failure.
export default function PinPrompt({ title = 'This note is locked', description = 'Enter your PIN to view it.', submitLabel = 'Unlock', onSubmit, onCancel, inline = false }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [opened, setOpened] = useState(false);
  // After too many wrong PINs the server blocks checks for a while; count down instead of letting you retry.
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [, tick] = useState(0);
  const left = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
  useEffect(() => {
    if (!blockedUntil) return undefined;
    const t = setInterval(() => { tick((n) => n + 1); if (Date.now() >= blockedUntil) { setBlockedUntil(0); setError(''); } }, 1000);
    return () => clearInterval(t);
  }, [blockedUntil]);
  const dialogRef = useRef(null);
  const noTrap = useRef(null);
  useFocusTrap(inline ? noTrap : dialogRef, onCancel);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await onSubmit(pin, {
        // Let the lock visibly open before the caller closes the prompt.
        beforeClose: () => new Promise((r) => { setOpened(true); setTimeout(r, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 200); }),
      });
    } catch (err) {
      if (err.status === 429) setBlockedUntil(Date.now() + (err.data?.retryAfter || 300) * 1000);
      setError(err.message); setPin(''); setBusy(false); setShake((s) => s + 1);
    }
  };

  const form = (
    <form onSubmit={submit} className="w-full max-w-xs text-center">
      <div key={shake} data-testid="pin-lock" data-state={opened ? 'open' : shake ? 'shake' : 'idle'} aria-hidden="true" className={`mx-auto inline-block text-3xl ${opened ? 'animate-unlock' : shake ? 'animate-shake' : ''}`}>{opened ? '🔓' : '🔒'}</div>
      <h2 id="pin-title" className="mt-2 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <input className="input mt-4 text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off"
        pattern="\d{4,6}" maxLength={6} autoFocus required placeholder="••••" aria-label="PIN" disabled={left > 0} aria-describedby={error ? 'pin-error' : undefined}
        value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {error && <p id="pin-error" role="alert" data-testid="pin-error" className="mt-2 text-sm text-red-700 dark:text-red-400">{left > 0 ? `Too many wrong attempts. Try again in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.` : error}</p>}
      <div className="mt-4 flex justify-center gap-2">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" disabled={busy || pin.length < 4 || left > 0}>{busy ? 'Checking…' : submitLabel}</button>
      </div>
    </form>
  );

  if (inline) return <div className="grid place-items-center py-16">{form}</div>;
  return (
    <div data-modal className="dialog-overlay" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pin-title" tabIndex={-1}
        className="dialog-panel w-auto p-6" onClick={(e) => e.stopPropagation()}>{form}</div>
    </div>
  );
}
