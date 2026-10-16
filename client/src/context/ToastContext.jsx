import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

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
      {/* Sits above the mobile bottom navigation. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 sm:bottom-6" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} data-testid="toast" className="pointer-events-auto flex min-h-12 max-w-md items-center gap-2 rounded-full border border-stone-800 bg-stone-900/95 py-1.5 pl-5 pr-1.5 text-sm text-stone-50 shadow-float backdrop-blur animate-toast-in dark:border-stone-300 dark:bg-stone-100 dark:text-stone-900">
            <span className="mr-1 py-1.5">{toast.message}</span>
            {toast.action && (
              <button className="min-h-9 rounded-lg bg-white/10 px-3 font-semibold text-white transition hover:bg-white/20 dark:bg-stone-900/10 dark:text-stone-900 dark:hover:bg-stone-900/20"
                onClick={() => { dismiss(); toast.action.onClick(); }}>{toast.action.label}</button>
            )}
            <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-300 transition hover:bg-white/10 hover:text-white dark:text-stone-600 dark:hover:bg-stone-900/10 dark:hover:text-stone-900" onClick={dismiss} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
