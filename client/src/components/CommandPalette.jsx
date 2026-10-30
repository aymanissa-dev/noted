import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { displayTitle } from '../lib/unlocked.js';
import { useTheme } from '../lib/theme.js';
import { useAuth } from '../context/AuthContext.jsx';
import { focusSearch } from '../lib/useShortcuts.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { useTypewriter, toggleTypewriter } from '../lib/typewriter.js';
import { useToast } from '../context/ToastContext.jsx';
import Kbd from './Kbd.jsx';
import Icon from './Icon.jsx';

const norm = (s) => (s || '').toLowerCase();

// One emoji (incl. ZWJ sequences / flags), not arbitrary text such as an imported "<b>x</b>".
const isEmoji = (v) => !!v && v.length <= 16 && /^\p{Extended_Pictographic}|^\p{Regional_Indicator}/u.test(v) && (typeof Intl.Segmenter !== "function" || [...new Intl.Segmenter().segment(v)].length === 1);

// How well a label matches the query: 3 exact, 2 prefix, 1 word prefix, 0.5 substring, 0 none.
export const matchScore = (label, s) => {
  const l = norm(label);
  if (!s) return 0.5;
  if (l === s) return 3;
  if (l.startsWith(s)) return 2;
  if (l.split(/[^a-z0-9]+/).some((w) => w.startsWith(s))) return 1;
  return l.includes(s) ? 0.5 : 0;
};

// Ctrl/⌘+K: search notes, jump to a view, or run an action. Each command shows its shortcut.
export default function CommandPalette({ onClose, onShortcuts }) {
  const navigate = useNavigate();
  const { cycle, theme } = useTheme();
  const { logout } = useAuth();
  const typewriter = useTypewriter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState(() => (api.cachedList({}) || []).slice(0, 6));
  // Track the highlighted row by id, so results arriving late (server search) can't move it.
  const [activeId, setActiveId] = useState(null);
  const ref = useRef(null);
  const listRef = useRef(null);
  useFocusTrap(ref, onClose);

  const go = (to) => () => navigate(to);
  const commands = useMemo(() => [
    { id: 'new', group: 'Actions', label: 'New note', icon: 'plus', keys: 'N', run: go('/notes/new') },
    { id: 'search', group: 'Actions', label: 'Search notes', icon: 'search', keys: '/', run: () => focusSearch(navigate, location.pathname) },
    { id: 'typewriter', group: 'Actions', label: `Typewriter mode (now ${typewriter ? 'on' : 'off'})`, icon: 'typewriter', keys: 'Alt+Shift+T',
      run: () => { const on = toggleTypewriter(); toast.show(on ? 'Typewriter mode on: the line you’re typing stays centered.' : 'Typewriter mode off.'); } },
    { id: 'theme', group: 'Actions', label: `Switch theme (now ${theme})`, icon: 'sun', run: cycle, keep: true },
    { id: 'go-notes', group: 'Go to', label: 'All notes', icon: 'notes', keys: 'G N', run: go('/notes') },
    { id: 'go-pinned', group: 'Go to', label: 'Pinned', icon: 'pin', run: go('/notes?smart=pinned') },
    { id: 'go-recent', group: 'Go to', label: 'Recently viewed', icon: 'clock', run: go('/notes?smart=recent') },
    { id: 'go-due', group: 'Go to', label: 'Reminders', icon: 'bell', run: go('/notes?smart=due') },
    { id: 'go-archive', group: 'Go to', label: 'Archive', icon: 'archive', keys: 'G A', run: go('/archive') },
    { id: 'go-trash', group: 'Go to', label: 'Trash', icon: 'trash', keys: 'G T', run: go('/trash') },
    { id: 'go-settings', group: 'Go to', label: 'Settings', icon: 'settings', keys: 'G S', run: go('/settings') },
    { id: 'go-stats', group: 'Go to', label: 'Storage stats', icon: 'chart', run: go('/stats') },
    { id: 'help', group: 'Help', label: 'How to use noted.', icon: 'help', keys: 'G H', run: go('/help') },
    { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', icon: 'keyboard', keys: '?', run: onShortcuts },
    { id: 'logout', group: 'Account', label: 'Log out', icon: 'logout', run: () => logout() },
  ], [theme, typewriter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search notes as you type (local copy first, then the server).
  useEffect(() => {
    const local = (api.cachedList({ search: q || undefined }) || []).slice(0, 6);
    setNotes(local);
    if (!q.trim()) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => api.listNotes({ search: q.trim() }, ctrl.signal).then(({ notes }) => setNotes(notes.slice(0, 6))).catch(() => {}), 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const s = norm(q.trim());
  const cmdMatches = commands
    .map((c, i) => ({ c, i, score: Math.max(matchScore(c.label, s), norm(c.group).includes(s) ? 0.5 : 0) }))
    .filter((x) => !s || x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
  const noteItems = notes.map((n) => ({ id: `note-${n._id}`, group: 'Notes', label: displayTitle(n), emoji: n.emoji, icon: n.locked ? 'lock' : 'notes', hint: n.tags?.slice(0, 2).map((t) => `#${t}`).join(' '), run: go(`/notes/${n._id}`) }));
  // A command whose name starts with the query ("sett", "trash", "how to") outranks notes that
  // only mention the word in their body.
  const bestCmd = cmdMatches.length ? matchScore(cmdMatches[0].label, s) : 0;
  const bestNote = noteItems.reduce((m, n) => Math.max(m, matchScore(n.label, s)), 0);
  const commandsFirst = !!s && bestCmd >= 2 && bestCmd >= bestNote;
  const items = commandsFirst ? [...cmdMatches, ...noteItems] : [...noteItems, ...cmdMatches];
  const found = items.findIndex((it) => it.id === activeId);
  const active = found >= 0 ? found : 0;
  const setActive = (fn) => { const i = typeof fn === 'function' ? fn(active) : fn; setActiveId(items[i]?.id ?? null); };
  useEffect(() => { setActiveId(null); }, [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const run = (item) => { if (!item) return; if (!item.keep) onClose(); item.run?.(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!e.isComposing) run(items[active]); }
  };

  let last = null;
  return (
    <div data-modal className="dialog-overlay items-start pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Command palette" data-testid="palette" className="dialog-panel max-w-xl overflow-hidden" tabIndex={-1}>
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 dark:border-stone-800">
          <Icon name="search" className="text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search notes or type a command…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-stone-500 dark:placeholder:text-stone-400"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined} aria-label="Search notes or commands" />
          <kbd className="kbd kbd-sm hidden sm:inline-flex">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {items.map((it, i) => {
            const header = it.group !== last ? (last = it.group) : null;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="section-label px-3 pb-1 pt-3 first:pt-1">{header}</p>}
                <div id={`pi-${it.id}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => run(it)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${i === active ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-700 dark:text-stone-300'}`}>
                  <span aria-hidden="true" className="flex w-5 shrink-0 items-center justify-center overflow-hidden">{isEmoji(it.emoji) ? <span className="leading-none">{it.emoji}</span> : <Icon name={it.icon} className="text-stone-500 dark:text-stone-400" />}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="truncate text-xs text-faint">{it.hint}</span>}
                  {it.keys && <Kbd combo={it.keys} size="sm" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-stone-100 px-4 py-2.5 text-xs text-muted dark:border-stone-800 sm:flex">
          <span className="inline-flex items-center gap-1.5"><Kbd combo="Up" size="sm" /><Kbd combo="Down" size="sm" /> move</span>
          <span className="inline-flex items-center gap-1.5"><Kbd combo="Enter" size="sm" /> open</span>
          <span className="ml-auto inline-flex items-center gap-1.5"><Kbd combo="Mod+K" size="sm" /> toggle</span>
        </div>
      </div>
    </div>
  );
}
