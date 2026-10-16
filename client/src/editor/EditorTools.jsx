import { useEffect, useRef, useState } from 'react';
import { headings } from '../lib/markdown.js';
import Icon from '../components/Icon.jsx';
import { keyLabel } from '../lib/keys.js';

const Btn = ({ label, tip, onClick, children, pressed, ...rest }) => (
  <button type="button" onClick={onClick} data-tip={tip || label} data-tip-align="start" aria-label={label} aria-pressed={pressed}
    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition sm:min-h-8 ${pressed ? 'bg-stone-200/70 text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'}`} {...rest}>
    {children}
  </button>
);
const I = ({ name }) => <Icon name={name} size="xs" />;

// Outline (jump to headings), find & replace, focus mode, print.
export default function EditorTools({ content, editor, focusMode, onFocusMode }) {
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
        <Btn label="Outline" tip="Jump to a heading" pressed={outlineOpen} onClick={() => setOutlineOpen((o) => !o)} aria-haspopup="true" aria-expanded={outlineOpen}>
          <I name="outline" /><span>Outline</span>
        </Btn>
        {outlineOpen && (
          <div data-testid="outline" className="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:border-stone-800 dark:bg-stone-900">
            {list.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted">No headings yet. Type / at the start of a line and pick a heading.</p> : list.map((h) => (
              <button key={h.line} type="button" onClick={() => { editor?.jumpToLine(h.line); setOutlineOpen(false); }}
                className="block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}>{h.text || 'Untitled heading'}</button>
            ))}
          </div>
        )}
      </div>
      <Btn label={`Find and replace (${keyLabel('Mod+F')})`} tip={`Find and replace · ${keyLabel('Mod+F')}`} onClick={() => editor?.openFind()}><I name="find" /><span>Find</span></Btn>
      <Btn label={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode'} tip="Focus mode: just you and the text" pressed={focusMode} onClick={() => onFocusMode(!focusMode)}><I name="focus" /><span>Focus</span></Btn>
    </div>
  );
}
