import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShortcutGroups } from '../components/ShortcutsHelp.jsx';
import Kbd from '../components/Kbd.jsx';
import Icon from '../components/Icon.jsx';
import { IS_MAC } from '../lib/keys.js';

export const openUI = (what) => window.dispatchEvent(new CustomEvent('noted:open', { detail: what }));

const BASICS = [
  { icon: 'edit', title: 'Write', items: [
    <>Start a note with <b>New note</b> (<Kbd combo="N" size="sm" />). The first line is the title. It saves as you type.</>,
    <>Type <Kbd combo="/" size="sm" /> at the start of a line for headings, checklists, quotes, code and today’s date. Type <Kbd combo=":" size="sm" /> for emoji.</>,
    <>Select text to highlight it, or use <Kbd combo="Mod+B" size="sm" /> <Kbd combo="Mod+I" size="sm" /> <Kbd combo="Mod+Shift+H" size="sm" />.</>,
    <><b>Focus</b> hides everything but the text; <b>Typewriter</b> keeps the line you’re typing centered (<Kbd combo="Alt+Shift+T" size="sm" />, or search “typewriter” in the palette); <b>Outline</b> jumps between headings.</>,
  ] },
  { icon: 'folder', title: 'Organize', items: [
    <><b>Pin</b> what you need most; it stays on top.</>,
    <>Put notes in <b>folders</b> and add <b>#tags</b>, even straight from quick capture: “Call Sam #work”.</>,
    <>Give a note a color or an emoji from the palette button in its toolbar.</>,
    <><b>Archive</b> tucks a note away. <b>Trash</b> keeps deleted notes for 30 days.</>,
  ] },
  { icon: 'search', title: 'Find', items: [
    <>Search (<Kbd combo="/" size="sm" />) looks through titles, text and tags.</>,
    <>Smart views: Recently viewed, Pinned, Edited today, This week, Untagged, Locked.</>,
    <>The command palette (<Kbd combo="Mod+K" size="sm" />) finds any note and runs any action.</>,
    <>Inside a note, <Kbd combo="Mod+F" size="sm" /> finds and replaces.</>,
  ] },
  { icon: 'shield', title: 'Keep it safe', items: [
    <><b>Lock</b> private notes with a PIN (set it in Settings).</>,
    <><b>Version history</b> in the <span className="whitespace-nowrap">“…”</span> menu restores earlier drafts.</>,
    <>Works offline; changes sync when you’re back.</>,
    <>Export everything as JSON or Markdown from Settings. No AI ever reads your notes.</>,
  ] },
];

const TOUCH = [
  ['Bottom bar', 'Notes, Search, New and Settings are always one tap away.'],
  ['Menu (☰)', 'Archive, Trash, Help, theme, storage stats and log out.'],
  ['Open a note', 'Tap a card. Tap the pin on a card to pin or unpin it.'],
  ['Select several', 'Tap Select above the list, then tap cards to merge, move or delete them together.'],
  ['In a note', 'Back returns to the list. Done closes the note. “…” holds history, lock, print, archive and delete.'],
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
      <p className="mt-3 max-w-xl text-muted">A two-minute guide. Write it down, find it later, and never lose a thought.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => openUI('tour')}><Icon name="compass" />Take the tour</button>
        <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={() => openUI('palette')}><Icon name="command" />Command palette<Kbd combo="Mod+K" size="sm" /></button>
        <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={() => openUI('shortcuts')}><Icon name="keyboard" />All shortcuts<Kbd combo="?" size="sm" /></button>
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
