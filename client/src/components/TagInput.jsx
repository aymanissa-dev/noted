import { useState } from 'react';

export default function TagInput({ tags, onChange }) {
  const [value, setValue] = useState('');

  const add = (raw) => {
    const t = raw.trim().toLowerCase().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(value); }
    else if (e.key === 'Backspace' && !value && tags.length) onChange(tags.slice(0, -1));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-700 dark:text-stone-200">
          #{t}
          <button type="button" className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input aria-label="Add tag" className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
        placeholder="Add tag…" title="Press Enter or comma to add a tag"
        value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} onBlur={() => value && add(value)} />
    </div>
  );
}
