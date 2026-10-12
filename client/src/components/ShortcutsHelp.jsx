import { useRef } from 'react';
import { SHORTCUTS } from '../lib/useShortcuts.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';

export default function ShortcutsHelp({ onClose }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  return (
    <div data-modal className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 dark:bg-black/60 px-4" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1}
        className="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="font-semibold">Keyboard shortcuts</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="space-y-2 text-sm">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-stone-600 dark:text-stone-300">{label}</span>
              <kbd className="rounded border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
