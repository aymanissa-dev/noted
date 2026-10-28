import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShortcutGroups } from '../components/ShortcutsHelp.jsx';
import Kbd from '../components/Kbd.jsx';
import Icon from '../components/Icon.jsx';
import { IS_MAC } from '../lib/keys.js';

export const openUI = (what) => window.dispatchEvent(new CustomEvent('noted:open', { detail: what }));

// Matches what's on screen: a title, the text, and one ··· menu for everything else.
const BASICS = [
  { icon: 'edit', title: 'Write', items: [
    <>Press <b>New note</b> (<Kbd combo="N" size="sm" />). Give it a title, then just write. It saves as you type.</>,
    <>Type <Kbd combo="/" size="sm" /> at the start of a line for headings, checklists and more. <Kbd combo="Mod+B" size="sm" /> and <Kbd combo="Mod+I" size="sm" /> work too.</>,
    <>Paste or drop an <b>image</b>, or choose <b>Add image</b> from the note’s <b>···</b> menu.</>,
  ] },
  { icon: 'search', title: 'Find', items: [
    <>Type in <b>Search</b> (<Kbd combo="/" size="sm" />). It looks through titles, text and tags.</>,
    <><b>Pin</b> a note to keep it on top. Add <b>#tags</b> under the title, or use <b>folders</b> from the sidebar.</>,
    <>Press <Kbd combo="Mod+K" size="sm" /> to jump to any note from anywhere.</>,
  ] },
  { icon: 'more', title: 'The ··· menu', items: [
    <>In a note, <b>···</b> holds the extras: image, color &amp; emoji, voice note, outline, find, focus and typewriter.</>,
    <>It also has <b>Share</b>, <b>Lock with PIN</b>, <b>Version history</b>, print, <b>Archive</b> and <b>Move to trash</b>.</>,
  ] },
  { icon: 'shield', title: 'Private by default', items: [
    <><b>Lock</b> private notes with a PIN (set it in Settings). Share links are read-only and you can turn them off any time.</>,
    <>Works offline; changes sync when you’re back. Export everything from Settings.</>,
  ] },
];

const TOUCH = [
  ['Bottom bar', 'Notes, Search, New and Settings are always one tap away.'],
  ['Menu (☰)', 'Archive, Trash, Help, theme and log out.'],
  ['Open a note', 'Tap a card. Tap the pin on a card to pin or unpin it.'],
  ['In a note', 'Back returns to the list. “···” holds images, share, lock, history, archive and delete.'],
  ['Formatting', 'Type / at the start of a line for headings and checklists; tap a checkbox to tick it.'],
  ['Install', 'Add noted. to your home screen from the browser’s share or menu button; it works offline.'],
];

export default function Help() {
  const [tab, setTab] = useState(() => (window.matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'keys'));
  useEffect(() => { document.title = 'Help · noted.'; return () => { document.title = 'noted.'; }; }, []);
  return (
    <div className="mx-auto max-w-4xl" data-testid="help-page">
      <p className="eyebrow">Help</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">How to use noted<span className="text-accent">.</span></h1>
      <p className="mt-3 max-w-xl text-muted">The one-minute guide. Write it down, find it later.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/notes/new" className="btn-primary"><Icon name="plus" />New note</Link>
        <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={() => openUI('shortcuts')}><Icon name="keyboard" />All shortcuts<Kbd combo="?" size="sm" /></button>
        <Link to="/changelog" className="btn-ghost"><Icon name="sparkle" />What’s new</Link>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {BASICS.map((b) => (
          <section key={b.title} className="surface p-5 sm:p-6" aria-labelledby={`help-${b.title}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-stone-900 dark:text-stone-100"><Icon name={b.icon} /></span>
              <h2 id={`help-${b.title}`} className="text-lg font-semibold">{b.title}</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm leading-6 text-stone-700 dark:text-stone-300">
              {b.items.map((t, i) => <li key={i} className="flex gap-2.5"><span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent" /><span>{t}</span></li>)}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-12" aria-labelledby="help-controls">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="help-controls" className="text-2xl font-semibold tracking-tight">Shortcuts &amp; controls</h2>
            <p className="mt-1 text-sm text-muted">{IS_MAC ? '⌘ Command · ⌥ Option · ⇧ Shift · ⌃ Control' : 'On a Mac, Ctrl is ⌘ Command.'}</p>
          </div>
          <div role="tablist" aria-label="Input type" className="inline-flex rounded-full border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900">
            {[['keys', 'Keyboard', 'keyboard'], ['touch', 'Touch', 'hand']].map(([id, label, icon]) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition sm:min-h-9 ${tab === id ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-muted hover:text-stone-900 dark:hover:text-stone-100'}`}>
                <Icon name={icon} size="sm" />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="surface mt-5 p-5 sm:p-6" role="tabpanel">
          {tab === 'keys' ? <ShortcutGroups columns="md:grid-cols-2" /> : (
            <dl className="divide-y divide-stone-100 dark:divide-stone-800" data-testid="touch-help">
              {TOUCH.map(([t, d]) => (
                <div key={t} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                  <dt className="text-sm font-semibold">{t}</dt><dd className="text-sm leading-6 text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <p className="mt-10 text-sm text-muted">Still stuck? Your notes are safe. <Link className="font-medium text-stone-900 underline underline-offset-2 dark:text-stone-100" to="/settings">Settings</Link> has export, PIN and session controls.</p>
    </div>
  );
}
