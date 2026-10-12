import { SHORTCUTS } from '../lib/useShortcuts.js';

export default function ShortcutsHelp({ onClose }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 dark:bg-black/60 px-4" onClick={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold">Keyboard shortcuts</h2>
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
