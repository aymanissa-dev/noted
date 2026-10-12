import { useState } from 'react';
import { COLORS, EMOJIS } from '../lib/colors.js';

export default function AppearancePicker({ color, emoji, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="btn-ghost px-2" title="Color & emoji" aria-label="Color and emoji" onClick={() => setOpen((o) => !o)}>
        {emoji ? <span className="text-base leading-none">{emoji}</span> : (
          <span className={`h-4 w-4 rounded-full border border-stone-300 dark:border-stone-600 ${COLORS[color]?.swatch}`} />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">Color</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLORS).map(([key, c]) => (
                <button key={key || 'none'} type="button" title={c.label} aria-label={c.label} onClick={() => onChange({ color: key })}
                  className={`h-7 w-7 rounded-full border ${c.swatch} ${color === key ? 'ring-2 ring-stone-900 ring-offset-2 dark:ring-stone-100 dark:ring-offset-stone-900' : 'border-stone-300 dark:border-stone-600'}`} />
              ))}
            </div>
            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-stone-400">Emoji</p>
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => onChange({ emoji: e })}
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
