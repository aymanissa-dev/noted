import { useState } from 'react';
import Icon from './Icon.jsx';
import { MOD } from '../lib/useShortcuts.js';

export const TIPS_KEY = 'noted.tipsDismissed';
const TIPS = [
  <>Press <kbd className="kbd">N</kbd> for a new note, <kbd className="kbd">/</kbd> to search, <kbd className="kbd">?</kbd> for all shortcuts.</>,
  <>In a note, type <kbd className="kbd">/</kbd> at the start of a line for headings, checklists and more.</>,
  <>Add <span className="font-medium">#tags</span> right in a quick note, like “Buy milk #errands”.</>,
  <>Select text in a note to highlight it. <kbd className="kbd">{MOD}</kbd> <kbd className="kbd">F</kbd> finds and replaces.</>,
];

// A small, dismissible tips card for new users (remembered on this device).
export default function TipsHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(TIPS_KEY) === '1');
  const [i, setI] = useState(0);
  if (dismissed) return null;
  const close = () => { localStorage.setItem(TIPS_KEY, '1'); setDismissed(true); };
  return (
    <aside aria-label="Tips" data-testid="tips" className="mt-4 flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-900">
      <Icon name="sparkle" className="mt-0.5 text-accent" />
      <p className="flex-1 leading-6 text-stone-700 dark:text-stone-300">{TIPS[i]}</p>
      <div className="-my-1.5 -mr-2 flex shrink-0 items-center">
        {i < TIPS.length - 1 && <button type="button" className="btn-ghost btn-sm" onClick={() => setI(i + 1)}>Next tip</button>}
        <button type="button" className="btn-ghost btn-icon" onClick={close} aria-label="Dismiss tips" data-tip="Don’t show tips" data-tip-align="end"><Icon name="close" /></button>
      </div>
    </aside>
  );
}
