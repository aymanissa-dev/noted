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
    <div className="mt-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5 shadow-sm focus-within:border-stone-400 dark:focus-within:border-stone-600">
      <textarea ref={ref} id="quick-capture" rows={1} value={text} onChange={onChange} onKeyDown={onKeyDown}
        placeholder="Quick note… (Enter to save)"
        title="Enter saves · Shift+Enter adds a line · #tag adds a tag"
        className="block w-full resize-none bg-transparent text-sm outline-none placeholder:text-stone-400" aria-label="Quick capture" />
    </div>
  );
}
