import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Dialog from '../components/Dialog.jsx';

// In-app replacements for window.confirm / window.prompt. Both return promises:
//   await confirm({ title, body, confirmLabel, danger }) → true | false
//   await prompt({ title, label, initial, placeholder, confirmLabel, validate }) → string | null
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const open = useCallback((d) => new Promise((resolve) => { resolver.current = resolve; setDialog(d); }), []);
  const close = (value) => { resolver.current?.(value); resolver.current = null; setDialog(null); };
  const confirm = useCallback((opts) => open({ kind: 'confirm', ...opts }), [open]);
  const prompt = useCallback((opts) => open({ kind: 'prompt', ...opts }), [open]);
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog?.kind === 'confirm' && <ConfirmDialog {...dialog} onDone={close} />}
      {dialog?.kind === 'prompt' && <PromptDialog {...dialog} onDone={close} />}
    </DialogContext.Provider>
  );
}

function ConfirmDialog({ title, body, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, onDone }) {
  return (
    <Dialog role="alertdialog" title={title} description={body} onClose={() => onDone(false)}
      footer={<>
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>{cancelLabel}</button>
        <button type="button" data-confirm autoFocus className={danger ? 'btn-danger-solid' : 'btn-primary'} onClick={() => onDone(true)}>{confirmLabel}</button>
      </>} />
  );
}

function PromptDialog({ title, body, label, initial = '', placeholder = '', confirmLabel = 'Save', maxLength = 60, validate, submit: onSubmit, allowEmpty = false, emptyMessage = 'Please enter a name.', type = 'text', inputMode, onDone }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    const problem = !v && !allowEmpty ? emptyMessage : validate?.(v);
    if (problem) return setError(problem);
    setBusy(true);
    try { if (onSubmit) await onSubmit(v); onDone(v); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Dialog title={title} description={body} onClose={() => onDone(null)}>
      <form onSubmit={submit} noValidate>
        <label className="label" htmlFor="prompt-input">{label}</label>
        <input id="prompt-input" className="input" autoFocus type={type} inputMode={inputMode} autoComplete="off" value={value} maxLength={maxLength} placeholder={placeholder}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'prompt-error' : undefined}
          onChange={(e) => { setValue(e.target.value); setError(''); }} onFocus={(e) => e.target.select()} />
        {error && <p id="prompt-error" role="alert" className="field-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-5">
          <button type="button" className="btn-ghost" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" data-confirm className="btn-primary" disabled={busy}>{busy ? 'Saving…' : confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

export const useDialog = () => useContext(DialogContext);
