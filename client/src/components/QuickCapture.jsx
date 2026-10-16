import { useRef, useState } from 'react';
import { parseQuickCapture } from '../lib/quickCapture.js';

// One-line capture: Enter saves, Shift+Enter adds a line. First line becomes the title.
export default function QuickCapture({ onCapture }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  const submit = () => {
    const parsed = parseQuickCapture(text);
    if (!parsed) return;
    setText('');
    if (ref.current) ref.current.style.height = '';
    onCapture(parsed, text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { setText(''); e.currentTarget.blur(); }
  };

  const onChange = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div data-tour="capture" className="mt-4 flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white px-4 py-3 shadow-soft transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 dark:border-stone-800 dark:bg-stone-900">
      <span aria-hidden="true" className="mt-[3px] h-3.5 w-0.5 shrink-0 rounded-full bg-accent" />
      <textarea ref={ref} id="quick-capture" rows={1} value={text} onChange={onChange} onKeyDown={onKeyDown}
        placeholder="Jot something down…"
        className="block min-w-0 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-stone-500 dark:placeholder:text-stone-400" aria-label="Quick note" aria-describedby="qc-hint" />
      <p id="qc-hint" className="hidden shrink-0 items-center gap-1.5 pt-px text-xs text-faint sm:flex"><span className="sr-only">First line becomes the title. Shift+Enter adds a line. </span>#tags work · <kbd className="kbd kbd-sm">↵</kbd> to save</p>
    </div>
  );
}
