import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SHORTCUT_GROUPS, keysFor } from '../lib/shortcutList.js';
import { IS_MAC } from '../lib/keys.js';
import { KbdList } from './Kbd.jsx';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';

export function ShortcutGroups({ filter = '', columns = 'sm:grid-cols-2' }) {
  const q = filter.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q) || i.keys.join(' ').toLowerCase().includes(q)) })).filter((g) => g.items.length);
  if (!groups.length) return <p className="py-6 text-center text-sm text-muted">No shortcut matches “{filter}”.</p>;
  return (
    <div className={`grid gap-x-8 gap-y-6 ${columns}`}>
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`sc-${g.id}`} data-testid={`shortcut-group-${g.id}`}>
          <h3 id={`sc-${g.id}`} className="section-label mb-1.5">{g.title}</h3>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800/70">
            {g.items.map((i) => (
              <li key={i.label + i.keys} className="flex min-h-10 items-center justify-between gap-4 py-1.5 text-sm">
                <span className="text-stone-700 dark:text-stone-300">{i.label}{i.where && <span className="text-faint"> · {i.where}</span>}</span>
                <KbdList combos={keysFor(i, IS_MAC)} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function ShortcutsHelp({ onClose }) {
  const [filter, setFilter] = useState('');
  return (
    <Dialog title="Keyboard shortcuts" description={`Every shortcut in noted. ${IS_MAC ? '⌘ is Command, ⌥ Option, ⇧ Shift.' : ''}`} onClose={onClose} closeButton size="max-w-3xl" className="flex max-h-[88vh] flex-col">
      <div className="relative mb-4">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input autoFocus className="input pl-9" placeholder="Filter shortcuts" aria-label="Filter shortcuts" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6"><ShortcutGroups filter={filter} /></div>
      <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-muted dark:border-stone-800">More in <Link to="/help" onClick={onClose} className="font-medium text-stone-800 underline underline-offset-2 dark:text-stone-200">How to use noted.</Link></p>
    </Dialog>
  );
}
