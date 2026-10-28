import { useEffect, useRef, useState } from 'react';
import { COLORS, EMOJIS } from '../lib/colors.js';
import { searchEmoji } from '../lib/emoji.js';

// Color and emoji for a note. Opened from the note's ··· menu (`open`/`onClose`), or from its own button.
export default function AppearancePicker({ color, emoji, onChange, open: openProp, onClose }) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (v) => { const next = typeof v === 'function' ? v(open) : v; if (controlled) { if (!next) onClose?.(); } else setOpenState(next); };
  const panel = useRef(null);
  useEffect(() => { if (open && controlled) panel.current?.querySelector('button')?.focus(); }, [open, controlled]);
  const [q, setQ] = useState('');
  const list = q.trim() ? searchEmoji(q, 48).map((e) => e.char) : EMOJIS;
  return (
    <div className={controlled ? 'absolute right-0 top-full' : 'relative'}>
      {!controlled && <button type="button" className="btn-ghost btn-icon" data-tip={open ? undefined : 'Color and emoji'} aria-label="Color and emoji" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {emoji ? <span className="text-base leading-none">{emoji}</span> : (
          <span className={`h-4 w-4 rounded-full border border-stone-300 dark:border-stone-600 ${COLORS[color]?.swatch}`} />
        )}
      </button>}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div ref={panel} role="dialog" aria-label="Color and emoji" className="menu absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] p-3" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
            <p className="mb-2 section-label">Color</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLORS).map(([key, c]) => (
                <button key={key || 'none'} type="button" title={c.label} aria-label={c.label} onClick={() => onChange({ color: key })}
                  className={`h-7 w-7 rounded-full border ${c.swatch} ${color === key ? 'ring-2 ring-stone-900 ring-offset-2 dark:ring-stone-100 dark:ring-offset-stone-900' : 'border-stone-300 dark:border-stone-600'}`} />
              ))}
            </div>
            <p className="mb-2 mt-4 section-label">Emoji</p>
            <input type="search" className="input mb-2 py-1.5" placeholder="Search emoji by name…" aria-label="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} />
            {list.length === 0 && <p className="py-2 text-xs text-muted">No emoji match “{q}”.</p>}
            <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
              {list.map((e) => (
                <button key={e} type="button" onClick={() => onChange({ emoji: e })} aria-label={`Emoji ${e}`}
                  className={`rounded-md p-1 text-lg leading-none hover:bg-stone-100 dark:hover:bg-stone-800 ${emoji === e ? 'bg-stone-100 dark:bg-stone-800' : ''}`}>{e}</button>
              ))}
            </div>
            {emoji && <button type="button" className="mt-2 text-xs text-stone-500 hover:underline" onClick={() => onChange({ emoji: '' })}>Remove emoji</button>}
          </div>
        </>
      )}
    </div>
  );
}
