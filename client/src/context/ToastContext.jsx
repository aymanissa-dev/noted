import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext({ show: () => {} });

// Minimal toast: one message at a time, optional action (e.g. Undo), auto-dismiss.
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const dismiss = useCallback(() => { clearTimeout(timer.current); setToast(null); }, []);
  const show = useCallback((message, { action, duration = 6000 } = {}) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, action });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="status" aria-live="polite">
        {toast && (
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-stone-900 dark:bg-stone-100 px-4 py-2.5 text-sm text-white dark:text-stone-900 shadow-lg">
            <span>{toast.message}</span>
            {toast.action && (
              <button className="font-semibold text-amber-300 dark:text-amber-600 hover:underline"
                onClick={() => { dismiss(); toast.action.onClick(); }}>{toast.action.label}</button>
            )}
            <button className="text-stone-400 hover:text-white dark:hover:text-stone-900" onClick={dismiss} aria-label="Dismiss">✕</button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
