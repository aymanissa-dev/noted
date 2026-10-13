import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const GITHUB = 'https://github.com/aymanissa-dev/noted';

const FEATURES = [
  ['Autosave', 'Every keystroke is saved as you type. No save button to forget.'],
  ['Search & tags', 'Find any note instantly by text, or filter with a tag.'],
  ['Pinning', 'Keep the notes you need most at the top.'],
  ['Archive & trash', 'Tuck notes away, or restore them from the trash for 30 days.'],
  ['Dark mode', 'Light, dark, or follow your system.'],
  ['Keyboard shortcuts', 'N for new, / to search, ? for the full list.'],
  ['Export & import', 'Take everything with you as JSON or Markdown.'],
  ['PIN-locked notes', 'Lock sensitive notes behind a PIN of your own.'],
  ['Note history', 'Look back at earlier versions and restore one.'],
  ['Quick capture', 'Jot a thought from the dashboard without opening a note.'],
  ['Offline PWA', 'Install it, keep writing offline, and sync when you’re back.'],
  ['Colors & emoji', 'Give a note a color and an emoji so it’s easy to spot.'],
];

const PRIVACY = [
  ['No AI', 'Your notes are never read, summarized, or used to train anything.'],
  ['No tracking', 'No analytics, no ads, no third-party scripts.'],
  ['Your data, exportable', 'Export every note any time, and delete your account whenever you like.'],
];

const MOCK_NOTES = [
  { title: 'Groceries', body: 'Oats, lemons, coffee beans, basil', tag: 'home', color: 'bg-amber-100 dark:bg-amber-900/40', emoji: '🛒', pinned: true },
  { title: 'Book list', body: 'Piranesi · The Overstory · Kindred', tag: 'reading', color: 'bg-white dark:bg-stone-900', emoji: '📚' },
  { title: 'Trip ideas', body: 'Lamu in March? Check ferry times', tag: 'travel', color: 'bg-sky-100 dark:bg-sky-900/40', emoji: '🌊' },
  { title: 'Standup', body: 'Ship landing page, review PR #12', tag: 'work', color: 'bg-white dark:bg-stone-900' },
];

function AppPreview() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-xl shadow-stone-900/5 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center gap-1.5 border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
      </div>
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Logo className="text-lg" />
          <span className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-900">+ New note</span>
        </div>
        <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-400 dark:border-stone-800 dark:bg-stone-900">Search notes…</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MOCK_NOTES.map((n) => (
            <div key={n.title} className={`rounded-xl border border-stone-200 p-3 text-left dark:border-stone-800 ${n.color}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold">{n.emoji && <span className="mr-1">{n.emoji}</span>}{n.title}</p>
                {n.pinned && <span className="text-xs text-accent">●</span>}
              </div>
              <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{n.body}</p>
              <span className="mt-2 inline-block rounded-full bg-stone-900/5 px-2 py-0.5 text-[10px] text-stone-600 dark:bg-white/10 dark:text-stone-300">#{n.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  useEffect(() => { document.title = 'noted. — Write it down. Find it later.'; return () => { document.title = 'noted.'; }; }, []);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-stone-900">Skip to content</a>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="noted. home"><Logo className="text-2xl" /></Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link to="/login" className="btn-ghost">Log in</Link>
          <Link to="/register" className="btn-primary hidden sm:inline-flex">Get started</Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Write it down.<br />Find it later<span className="text-accent">.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-stone-600 dark:text-stone-400 sm:text-lg">A simple, private space for your notes. No AI, no clutter, just your words.</p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link to="/register" className="btn-primary px-6 py-3 text-base">Get started, it’s free</Link>
            <Link to="/login" className="btn-ghost px-6 py-3 text-base">Log in</Link>
          </div>
          <div className="mt-14"><AppPreview /></div>
        </section>

        <section aria-labelledby="features-title" className="border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 id="features-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Everything a notebook needs<span className="text-accent">.</span></h2>
            <p className="mt-2 text-stone-600 dark:text-stone-400">Nothing it doesn’t.</p>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([t, d]) => (
                <li key={t} className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="privacy-title" className="border-t border-stone-200 bg-stone-100/60 dark:border-stone-800 dark:bg-stone-900/40">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 id="privacy-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Private by default<span className="text-accent">.</span></h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {PRIVACY.map(([t, d]) => (
                <div key={t}>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-10"><Link to="/register" className="btn-primary px-6 py-3 text-base">Start writing</Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-stone-500 dark:text-stone-400 sm:flex-row sm:px-6">
          <Logo className="text-base" />
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">Source on GitHub</a>
        </div>
      </footer>
    </div>
  );
}
