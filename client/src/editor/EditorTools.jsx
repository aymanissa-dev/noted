import { useEffect, useRef, useState } from 'react';
import { headings } from '../lib/markdown.js';

const Btn = ({ label, onClick, children, pressed, ...rest }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={pressed}
    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition ${pressed ? 'bg-stone-200/70 text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'}`} {...rest}>
    {children}
  </button>
);
const I = ({ d }) => <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

// Outline (jump to headings), find & replace, focus mode, print.
export default function EditorTools({ content, editor, focusMode, onFocusMode, onPrint }) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const ref = useRef(null);
  const list = outlineOpen ? headings(content) : [];
  useEffect(() => {
    if (!outlineOpen) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOutlineOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOutlineOpen(false); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  }, [outlineOpen]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 print:hidden" role="toolbar" aria-label="Editor tools">
      <div className="relative" ref={ref}>
        <Btn label="Outline" pressed={outlineOpen} onClick={() => setOutlineOpen((o) => !o)} aria-haspopup="true" aria-expanded={outlineOpen}>
          <I d="M4 6h16M8 12h12M12 18h8" /><span>Outline</span>
        </Btn>
        {outlineOpen && (
          <div data-testid="outline" className="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:border-stone-800 dark:bg-stone-900">
            {list.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted">No headings yet. Type /h1 to add one.</p> : list.map((h) => (
              <button key={h.line} type="button" onClick={() => { editor?.jumpToLine(h.line); setOutlineOpen(false); }}
                className="block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}>{h.text || 'Untitled heading'}</button>
            ))}
          </div>
        )}
      </div>
      <Btn label="Find and replace (Ctrl/⌘ F)" onClick={() => editor?.openFind()}><I d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" /><span>Find</span></Btn>
      <Btn label={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode'} pressed={focusMode} onClick={() => onFocusMode(!focusMode)}><I d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><span>Focus</span></Btn>
      <Btn label="Print or save as PDF" onClick={onPrint}><I d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /><span>Print</span></Btn>
      <span className="ml-auto hidden text-xs text-faint sm:inline">Type / for commands · : for emoji</span>
    </div>
  );
}
