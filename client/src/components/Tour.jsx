import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import Kbd from './Kbd.jsx';

export const TOUR_PENDING = 'noted.tourPending';
export const TOUR_DONE = 'noted.tourDone';

const touch = () => window.matchMedia('(max-width: 639px)').matches;

// Each step points at a [data-tour] element; on phones the copy talks about taps, not keys.
const STEPS = [
  { target: 'new', title: 'Start a note', body: () => touch() ? <>Tap <b>New</b> at the bottom to start writing. Everything saves as you type.</> : <>Click <b>New note</b> or press <Kbd combo="N" size="sm" /> anywhere. Everything saves as you type.</> },
  { target: 'capture', title: 'Jot it down fast', body: () => <>Type a quick thought here and press {touch() ? <b>Enter</b> : <Kbd combo="Enter" size="sm" />}. Add <b>#tags</b> anywhere in the line.</> },
  { target: 'search', title: 'Find it later', body: () => touch() ? <>Search titles, text and tags. Tap <b>Search</b> in the bottom bar to jump here.</> : <>Search titles, text and tags. Press <Kbd combo="/" size="sm" /> to jump here from anywhere.</> },
  { target: 'palette', title: 'Everything in one place', body: () => touch() ? <>Open the menu for Archive, Trash, Settings and <b>Help</b>.</> : <>Press <Kbd combo="Mod+K" size="sm" /> to search notes, jump anywhere, or run any action. <Kbd combo="?" size="sm" /> lists every shortcut.</> },
  { target: 'help', title: 'Help is always here', body: () => <>Open <b>How to use noted.</b> from {touch() ? 'the menu' : 'the account menu or the sidebar'} any time, and replay this tour from there.</> },
];

const find = (name) => [...document.querySelectorAll(`[data-tour="${name}"]`)].find((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

// A short, skippable first-run tour (re-runnable from Help or the command palette).
export default function Tour({ onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const finish = () => { localStorage.setItem(TOUR_DONE, '1'); localStorage.removeItem(TOUR_PENDING); onClose(); };
  useFocusTrap(ref, finish);
  const steps = STEPS;
  const step = steps[i];

  useLayoutEffect(() => {
    const measure = () => {
      const el = find(step.target);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const el = find(step.target);
    if (el && (el.getBoundingClientRect().top < 60 || el.getBoundingClientRect().bottom > innerHeight - 80)) el.scrollIntoView({ block: 'center' });
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step.target]);
  useEffect(() => { ref.current?.querySelector('[data-primary]')?.focus(); }, [i]);

  const pad = 6;
  const below = !rect || rect.top + rect.height + 220 < innerHeight;
  const cardStyle = rect
    ? { top: below ? rect.top + rect.height + pad + 10 : undefined, bottom: below ? undefined : innerHeight - rect.top + pad + 10, left: Math.max(12, Math.min(rect.left, innerWidth - 332)) }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div data-modal data-testid="tour" className="fixed inset-0 z-50">
      {rect
        ? <div aria-hidden="true" className="pointer-events-none fixed rounded-xl ring-2 ring-accent transition-all duration-200" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgb(12 10 9 / 0.45)' }} />
        : <div aria-hidden="true" className="fixed inset-0 bg-stone-950/45" />}
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1}
        className="fixed w-[min(320px,calc(100vw-24px))] rounded-xl border border-stone-200/80 bg-white p-5 shadow-float outline-none animate-dialog-in dark:border-stone-800 dark:bg-stone-900" style={cardStyle}>
        <p className="eyebrow">Step {i + 1} of {steps.length}</p>
        <h2 id="tour-title" className="mt-1.5 text-base font-semibold text-stone-900 dark:text-stone-100">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-stone-600 dark:text-stone-300">{step.body()}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="mr-auto flex gap-1" aria-hidden="true">{steps.map((_, j) => <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-4 bg-accent' : 'w-1.5 bg-stone-300 dark:bg-stone-700'}`} />)}</div>
          <button type="button" className="btn-ghost btn-sm" onClick={finish}>{i === steps.length - 1 ? 'Close' : 'Skip tour'}</button>
          {i > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" data-primary className="btn-primary btn-sm" onClick={() => (i === steps.length - 1 ? finish() : setI(i + 1))}>{i === steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
