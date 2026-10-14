import { useState } from 'react';
import Icon from './Icon.jsx';

// Password input with show/hide and a Caps Lock warning.
export default function PasswordField({ id, label, value, onChange, onBlur, autoComplete, error, hint, autoFocus }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const checkCaps = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  const desc = [error && `${id}-error`, caps && `${id}-caps`, hint && !error && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} className="input pr-12" type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
          value={value} onChange={onChange} onBlur={(e) => { setCaps(false); onBlur?.(e); }} onKeyDown={checkCaps} onKeyUp={checkCaps}
          aria-invalid={Boolean(error)} aria-describedby={desc} />
        <button type="button" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {caps && <p id={`${id}-caps`} data-testid="caps-warning" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"><Icon name="alert" size="xs" />Caps Lock is on</p>}
      {error ? <p id={`${id}-error`} role="alert" className="field-error">{error}</p> : hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
    </div>
  );
}
