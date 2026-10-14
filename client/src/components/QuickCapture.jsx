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
    <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 dark:border-stone-800 dark:bg-stone-900">
      <textarea ref={ref} id="quick-capture" rows={1} value={text} onChange={onChange} onKeyDown={onKeyDown}
        placeholder="Jot something down… #tags work · Enter to save"
        
        className="block w-full resize-none bg-transparent text-sm outline-none placeholder:text-stone-500 dark:placeholder:text-stone-400" aria-label="Quick note" aria-describedby="qc-hint" />
      <p id="qc-hint" className="sr-only">First line becomes the title. Enter saves, Shift+Enter adds a line, #tags become tags.</p>
    </div>
  );
}
