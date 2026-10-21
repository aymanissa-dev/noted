import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Kbd from '../components/Kbd.jsx';
import { useTheme } from '../lib/theme.js';
import { IS_MAC } from '../lib/keys.js';

// One label for every sign-up link on the page (hero, privacy, closing band, footer). The sticky
// header keeps a compact variant on purpose: it shares the bar with nav, theme and Log in.
const CTA = 'Start writing — it’s free';
const CTA_COMPACT = 'Start writing';

const GITHUB = 'https://github.com/aymanissa-dev/noted';

// Fades sections in as they scroll into view (instantly visible with reduced motion or no IntersectionObserver).
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')];
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

function ThemePill() {
  const { theme, setTheme } = useTheme();
  const opts = [['light', 'sun', 'Light'], ['system', 'monitor', 'System'], ['dark', 'moon', 'Dark']];
  return (
    <div role="radiogroup" aria-label="Theme" className="hidden items-center rounded-full border border-stone-200 bg-stone-100/80 p-0.5 dark:border-stone-800 dark:bg-stone-900 sm:inline-flex">
      {opts.map(([id, icon, label]) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} aria-label={`${label} theme`} onClick={() => setTheme(id)}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${theme === id ? 'bg-white text-stone-900 shadow-soft dark:bg-stone-700 dark:text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'}`}>
          <Icon name={icon} size="xs" />
        </button>
      ))}
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`sticky top-0 z-30 transition-colors ${scrolled ? 'border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-md dark:border-stone-800/70 dark:bg-stone-950/75' : 'border-b border-transparent'}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" aria-label="noted. home"><Logo className="text-[1.6rem]" bounce /></Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm text-stone-600 dark:text-stone-400 md:flex">
            {[['#features', 'Features'], ['#shortcuts', 'Shortcuts'], ['#privacy', 'Privacy'], ['#faq', 'FAQ']].map(([h, l]) => <a key={h} href={h} className="transition hover:text-stone-900 dark:hover:text-white">{l}</a>)}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemePill />
          <Link to="/login" className="btn-ghost">Log in</Link>
          <Link to="/register" className="btn-primary hidden sm:inline-flex" data-cta="compact">{CTA_COMPACT}</Link>
        </div>
      </div>
    </header>
  );
}

// A live-looking preview of the app, built from HTML/CSS (no screenshots, no external images).
function AppPreview() {
  const notes = [
    { t: 'Trip to Lamu', b: 'Ferry 9:30 · pack the snorkel', tag: 'travel', e: '🌊', on: true, pin: true, c: 'bg-sky-50 dark:bg-sky-950/40' },
    { t: 'Reading list', b: 'Piranesi · Kindred · The Overstory', tag: 'books', e: '📚' },
    { t: 'Groceries', b: 'Oats, lemons, coffee beans', tag: 'home', e: '🛒', c: 'bg-amber-50 dark:bg-amber-950/30' },
    { t: 'Standup', b: 'Ship landing · review PR #12', tag: 'work' },
  ];
  return (
    <div aria-hidden="true" className="preview relative mx-auto w-full max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-float ring-1 ring-black/[0.02] dark:border-stone-800 dark:bg-stone-900 dark:ring-white/5">
        <div className="flex items-center gap-2 border-b border-stone-200/70 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/60">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <div className="mx-auto hidden h-6 w-64 items-center justify-center rounded-md bg-white text-[11px] text-stone-500 ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:ring-stone-800 sm:flex">noted-lac-phi.vercel.app</div>
        </div>
        <div className="grid grid-cols-1 text-left sm:grid-cols-[13rem_1fr] md:grid-cols-[13rem_17rem_1fr]">
          <div className="hidden border-r border-stone-200/70 p-4 dark:border-stone-800 sm:block">
            <Logo className="text-lg" />
            <div className="mt-4 space-y-0.5 text-[13px]">
              {[['notes', 'All notes', true], ['pin', 'Pinned'], ['clock', 'Recently viewed'], ['today', 'Edited today']].map(([i, l, a]) => (
                <div key={l} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${a ? 'bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-600 dark:text-stone-400'}`}><Icon name={i} size="xs" />{l}</div>
              ))}
            </div>
            <p className="eyebrow mt-5 px-2">Folders</p>
            <div className="mt-1 space-y-0.5 text-[13px] text-stone-600 dark:text-stone-400">
              {['Personal', 'Work', 'Ideas'].map((f) => <div key={f} className="flex items-center gap-2 px-2 py-1.5"><Icon name="folder" size="xs" />{f}</div>)}
            </div>
          </div>
          <div className="border-r border-stone-200/70 p-4 dark:border-stone-800">
            <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400"><Icon name="search" size="xs" />Search notes<span className="ml-auto"><Kbd combo="/" size="sm" /></span></div>
            <div className="mt-3 space-y-2">
              {notes.map((n, i) => (
                <div key={n.t} className={`preview-card rounded-lg border p-3 ${n.on ? 'border-accent/70 ring-2 ring-accent/20' : 'border-stone-200/80 dark:border-stone-800'} ${n.c || 'bg-white dark:bg-stone-900'}`} style={{ '--i': i }}>
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-[13px] font-semibold text-stone-900 dark:text-white">{n.e && <span className="mr-1">{n.e}</span>}{n.t}</p>{n.pin && <Icon name="pin" size="xs" className="text-accent" />}</div>
                  <p className="mt-0.5 truncate text-[11px] text-stone-600 dark:text-stone-400">{n.b}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-stone-900/5 px-1.5 py-px text-[10px] text-stone-600 dark:bg-white/10 dark:text-stone-300">#{n.tag}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden p-6 md:block">
            <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400"><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Saved</span><span>· #travel</span></div>
            <p className="mt-3 text-xl font-semibold tracking-tight text-stone-900 dark:text-white">🌊 Trip to Lamu</p>
            <div className="mt-3 space-y-2 font-mono text-[12.5px] leading-6 text-stone-700 dark:text-stone-300">
              <p><span className="text-stone-400">## </span><b className="font-sans text-[14px] text-stone-900 dark:text-white">Before we go</b></p>
              <p className="flex items-center gap-2"><span className="grid h-3.5 w-3.5 place-items-center rounded-[4px] bg-accent text-white"><Icon name="check" size="xs" className="!h-2.5 !w-2.5" /></span><span className="text-stone-500 line-through dark:text-stone-400">Book the ferry</span></p>
              <p className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[4px] border border-stone-300 dark:border-stone-600" />Pack the <mark className="hl-yellow rounded px-0.5 text-stone-900">snorkel</mark></p>
              <p className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-[4px] border border-stone-300 dark:border-stone-600" />Ask Amina about the dhow</p>
              <p className="pt-1 font-sans text-[13px]">Ferry leaves 9:30<span className="typing" /></p>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-float absolute -bottom-6 right-4 hidden w-72 rounded-xl border border-stone-200/80 bg-white/95 p-2 text-left shadow-float backdrop-blur dark:border-stone-700 dark:bg-stone-900/95 sm:block lg:-right-8">
        <div className="flex items-center gap-2 border-b border-stone-100 px-2 pb-2 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400"><Icon name="search" size="xs" />lamu<span className="ml-auto"><Kbd combo="Mod+K" size="sm" /></span></div>
        <div className="mt-1 flex items-center gap-2 rounded-md bg-stone-100 px-2 py-1.5 text-xs text-stone-800 dark:bg-stone-800 dark:text-stone-100">🌊 Trip to Lamu<span className="ml-auto text-[11px] text-stone-600 dark:text-stone-300">#travel</span></div>
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-600 dark:text-stone-300"><Icon name="plus" size="xs" />New note<span className="ml-auto"><Kbd combo="N" size="sm" /></span></div>
      </div>
    </div>
  );
}

const BIG = [
  { eyebrow: 'Write', title: 'A quiet editor that keeps up.', body: 'Markdown that stays out of the way. Type / for headings, checklists, quotes and dates; highlight a phrase; fold a section; go full focus.', demo: 'editor' },
  { eyebrow: 'Find', title: 'Search that just finds it.', body: 'Titles, text and tags, as you type. Smart views for pinned, recent, this week and untagged. Or press ⌘K and jump anywhere.', demo: 'search' },
  { eyebrow: 'Capture', title: 'Thoughts in, before they fade.', body: 'Quick capture lives at the top of your notes. One line, Enter, done. #tags anywhere in the line become tags.', demo: 'capture' },
  { eyebrow: 'Rewind', title: 'Every draft, still there.', body: 'Version history keeps earlier drafts so you can compare and restore. Deleted notes wait 30 days in the trash.', demo: 'history' },
];

function Demo({ kind }) {
  if (kind === 'editor') return (
    <div className="w-full max-w-sm rounded-xl border border-white/60 bg-white/90 p-4 text-left shadow-lift backdrop-blur dark:border-white/10 dark:bg-stone-900/90">
      <p className="font-mono text-xs text-stone-500 dark:text-stone-400">/che<span className="typing" /></p>
      <div className="mt-2 rounded-lg border border-stone-200 bg-white p-1 text-[13px] dark:border-stone-700 dark:bg-stone-950">
        {[['Checklist', '- [ ]', true], ['Code block', '```'], ['Heading 2', '##'], ['Date', 'today']].map(([l, d, a]) => <div key={l} className={`flex justify-between rounded-md px-2.5 py-1.5 ${a ? 'bg-accent/15 text-stone-900 dark:text-white' : 'text-stone-600 dark:text-stone-300'}`}><span>{l}</span><span className="font-mono text-[11px] opacity-60">{d}</span></div>)}
      </div>
    </div>
  );
  if (kind === 'search') return (
    <div className="w-full max-w-sm space-y-2 text-left">
      <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-4 py-2.5 text-sm text-stone-800 shadow-lift dark:border-white/10 dark:bg-stone-900/95 dark:text-stone-100"><Icon name="search" size="sm" className="text-stone-400" />coffee<span className="typing" /></div>
      {[['🛒 Groceries', 'Oats, lemons, <coffee> beans'], ['☕ Café list', 'Best <coffee> in Westlands']].map(([t, b]) => (
        <div key={t} className="rounded-xl border border-white/60 bg-white/90 px-4 py-3 shadow-soft backdrop-blur dark:border-white/10 dark:bg-stone-900/90">
          <p className="text-sm font-semibold text-stone-900 dark:text-white">{t}</p>
          <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-300">{b.split(/[<>]/).map((s, i) => i === 1 ? <mark key={i} className="hl-yellow rounded px-0.5 text-stone-900">{s}</mark> : s)}</p>
        </div>
      ))}
    </div>
  );
  if (kind === 'capture') return (
    <div className="w-full max-w-sm text-left">
      <div className="flex items-center gap-3 rounded-xl border border-accent/60 bg-white/95 px-4 py-3 text-sm text-stone-800 shadow-lift ring-4 ring-accent/15 dark:bg-stone-900/95 dark:text-stone-100"><span className="h-3.5 w-0.5 rounded-full bg-accent" />Call the plumber Tuesday <span className="text-accent">#home</span><span className="typing" /><kbd className="kbd kbd-sm ml-auto">↵</kbd></div>
      <div className="mt-3 rounded-xl border border-white/60 bg-white/80 px-4 py-3 shadow-soft dark:border-white/10 dark:bg-stone-900/80"><p className="text-sm font-semibold text-stone-900 dark:text-white">Call the plumber Tuesday</p><span className="mt-1 inline-block rounded-full bg-stone-900/5 px-2 py-px text-[11px] text-stone-600 dark:bg-white/10 dark:text-stone-300">#home</span><span className="ml-2 text-[11px] text-stone-500">just now</span></div>
    </div>
  );
  return (
    <div className="w-full max-w-sm rounded-xl border border-white/60 bg-white/90 p-2 text-left shadow-lift backdrop-blur dark:border-white/10 dark:bg-stone-900/90">
      {[['Current version', 'now', true], ['Earlier today', '2:14 PM'], ['Yesterday', '6:02 PM'], ['Mon 12 Oct', '9:40 AM']].map(([l, t, a]) => <div key={l} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] ${a ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-600 dark:text-stone-300'}`}><Icon name="history" size="xs" />{l}<span className="ml-auto font-mono text-[11px] opacity-70">{t}</span></div>)}
    </div>
  );
}

const MORE = [
  ['pin', 'Pin what matters', 'Your most-used notes stay on top.'],
  ['folder', 'Folders & tags', 'File it, tag it, or both.'],
  ['lock', 'PIN-locked notes', 'Keep private notes behind a PIN.'],
  ['offline', 'Works offline', 'Install it. Write on the bus. It syncs later.'],
  ['palette', 'Colors & emoji', 'Make a note easy to spot at a glance.'],
  ['mic', 'Voice notes', 'Record a clip right inside a note.'],
  ['merge', 'Merge & split', 'Combine scattered notes, or break one up.'],
  ['moon', 'Light & dark', 'Or follow your system. Easy on the eyes.'],
  ['download', 'Export anytime', 'JSON or Markdown. Your notes, your files.'],
];

const KEYS = [
  ['N', 'New note'], ['/', 'Search'], ['Q', 'Quick capture'], ['Mod+K', 'Command palette'],
  ['Mod+B', 'Bold'], ['Mod+Shift+H', 'Highlight'], ['G A', 'Go to archive'], ['?', 'Every shortcut'],
];

function ShortcutShowcase() {
  const [hit, setHit] = useState(null);
  const t = useRef();
  useEffect(() => {
    const on = (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
      const combo = mod && k === 'k' ? 'Mod+K' : mod && e.shiftKey && k === 'h' ? 'Mod+Shift+H' : mod && k === 'b' ? 'Mod+B' : !mod && ({ n: 'N', '/': '/', q: 'Q', '?': '?' })[e.key];
      if (!combo) return;
      setHit(combo); clearTimeout(t.current); t.current = setTimeout(() => setHit(null), 700);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <section id="shortcuts" aria-labelledby="shortcuts-title" className="ink scroll-mt-16 relative overflow-hidden bg-[#0d0b0a] text-stone-100">
      <div aria-hidden="true" className="ink-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="reveal grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <div>
            <p className="eyebrow !text-stone-400">Keyboard first</p>
            <h2 id="shortcuts-title" className="mt-4 font-mono text-4xl font-medium leading-[1.05] tracking-[-0.04em] sm:text-6xl">Hands on<br />the keys<span className="text-accent">.</span></h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-stone-400 lg:justify-self-end">Every action has a shortcut, and every shortcut is listed. Press <kbd className="kbd kbd-sm !border-stone-700 !bg-stone-800 !text-stone-100">?</kbd> in the app to see them all. Try a few here.</p>
        </div>
        <ul className="reveal mt-14 grid grid-cols-2 border-l border-t border-white/10 sm:grid-cols-4">
          {KEYS.map(([k, l]) => (
            <li key={k} data-key={k} className={`group relative border-b border-r border-white/10 p-5 transition-colors duration-300 sm:p-7 ${hit === k ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
              <Kbd combo={k} className={`keycaps transition-transform duration-150 ${hit === k ? 'scale-110' : ''}`} />
              <p className="mt-6 text-sm text-stone-400 transition group-hover:text-stone-200">{l}</p>
              {hit === k && <span aria-hidden="true" className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-accent" />}
            </li>
          ))}
        </ul>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-400">{IS_MAC ? '⌘ Command · ⇧ Shift · then = press in sequence' : 'On a Mac, Ctrl is ⌘ · then = press in sequence'}</p>
      </div>
    </section>
  );
}

const FAQ = [
  ['Is noted. free?', 'Yes. Create an account and start writing. There’s no paid tier and no limits to unlock.'],
  ['Does noted. use AI on my notes?', 'No. Nothing reads, summarizes or trains on what you write. There are no analytics or third-party trackers either.'],
  ['Can I use it offline?', 'Yes. Install it from your browser (it’s a PWA). Notes you’ve opened are available offline, new notes and edits are queued, and everything syncs when you reconnect.'],
  ['How do I get my notes out?', 'Settings → Export gives you every note as JSON or as a Markdown zip, any time. You can import a JSON export back in too.'],
  ['What happens when I delete a note?', 'It moves to the trash for 30 days, where you can restore it. Empty the trash or choose “Delete forever” to remove it right away.'],
  ['Can I keep some notes extra private?', 'Set a PIN in Settings, then lock any note. Locked notes stay hidden in lists and search until you unlock them.'],
  ['Is the code open?', 'Yes, the source is on GitHub.'],
];

export default function Landing() {
  useReveal();
  useEffect(() => { document.title = 'noted. — Write it down. Find it later.'; return () => { document.title = 'noted.'; }; }, []);
  return (
    <div className="landing min-h-screen overflow-x-clip bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-stone-900">Skip to content</a>
      <Nav />
      <main id="main">
        {/* Hero */}
        <section className="hero relative -mt-16 overflow-hidden pt-16">
          <div aria-hidden="true" className="hero-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-14 text-center sm:px-8 sm:pt-24">
            <a href="#privacy" className="hero-in inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 py-1 pl-1 pr-3 text-xs font-medium text-stone-700 shadow-soft backdrop-blur transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-300">
              <span className="rounded-full bg-stone-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white dark:bg-white dark:text-stone-900">No AI</span>
              Private by design. Your words stay yours.
              <Icon name="arrowRight" size="xs" />
            </a>
            <h1 className="hero-in mx-auto mt-7 max-w-4xl text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] [animation-delay:60ms] sm:text-7xl lg:text-[5.5rem]">
              Write it down.<br /><span className="marker">Find it later<span className="text-accent">.</span></span>
            </h1>
            <p className="hero-in mx-auto mt-6 max-w-xl text-lg leading-8 text-stone-600 [animation-delay:120ms] dark:text-stone-400 sm:text-xl">A calm, private notebook for everything you don’t want to forget. Fast to write in, faster to search, and it works offline.</p>
            <div className="hero-in mt-9 flex flex-col items-stretch justify-center gap-3 [animation-delay:180ms] sm:flex-row sm:items-center">
              <Link to="/register" className="btn-primary h-12 px-7 text-base">{CTA}<Icon name="arrowRight" size="sm" /></Link>
              <Link to="/login" className="btn-secondary hidden h-12 px-7 text-base sm:inline-flex">I have an account</Link>
              <Link to="/login" className="mx-auto inline-flex min-h-11 items-center text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 dark:text-stone-300 dark:decoration-stone-600 dark:hover:text-white sm:hidden">I have an account</Link>
            </div>
            <ul className="hero-in mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-stone-600 [animation-delay:240ms] dark:text-stone-400">
              {[['offline', 'Works offline'], ['download', 'Installable app'], ['shield', 'No tracking']].map(([i, l]) => <li key={l} className="inline-flex items-center gap-1.5"><Icon name={i} size="sm" />{l}</li>)}
            </ul>
            <div className="hero-in mt-16 [animation-delay:300ms] sm:mt-20"><AppPreview /></div>
          </div>
        </section>

        {/* Facts strip */}
        <section aria-label="At a glance" className="border-y border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-900/40">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
            {[['0', 'AI models reading your notes'], ['0', 'trackers or ads'], ['30', 'days to undo a delete'], ['2', 'export formats, any time']].map(([n, l], i) => (
              <div key={l} className={`reveal px-5 py-8 sm:px-8 sm:py-10 ${i % 2 ? 'border-l' : ''} ${i >= 2 ? 'border-t sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''} border-stone-200/80 dark:border-stone-800`}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-mono text-4xl font-medium tracking-tight sm:text-5xl">{n}</dd>
                <dd className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400">{l}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-16 bg-stone-100/70 dark:bg-stone-950">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="reveal max-w-2xl">
              <p className="eyebrow">Features</p>
              <h2 id="features-title" className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">A calmer way to keep notes<span className="text-accent">.</span></h2>
              <p className="mt-5 text-lg leading-8 text-stone-600 dark:text-stone-400">Everything a notebook needs, nothing it doesn’t. Every keystroke saved, every note a search away.</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {BIG.map((f, i) => (
                <article key={f.title} className="reveal group overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900" style={{ transitionDelay: `${(i % 2) * 80}ms` }}>
                  <div className={`feature-art feature-art-${i} relative grid h-64 place-items-center overflow-hidden px-6 sm:h-72`}><Demo kind={f.demo} /></div>
                  <div className="p-7 sm:p-8">
                    <p className="eyebrow">{f.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-2 leading-7 text-stone-600 dark:text-stone-400">{f.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="reveal mt-20">
              <h3 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">And the small things that add up.</h3>
              <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MORE.map(([icon, t, d]) => (
                  <li key={t} className="flex gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft dark:border-stone-800 dark:bg-stone-900">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100"><Icon name={icon} /></span>
                    <div><p className="font-semibold">{t}</p><p className="mt-0.5 text-sm leading-6 text-stone-600 dark:text-stone-400">{d}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <ShortcutShowcase />

        {/* Privacy */}
        <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="reveal grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="eyebrow">Privacy</p>
                <h2 id="privacy-title" className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">Private by default<span className="text-accent">.</span> Not by setting.</h2>
                <p className="mt-5 max-w-lg text-lg leading-8 text-stone-600 dark:text-stone-400">Your notes are for you. noted. has no AI features, no analytics and no ads, so there’s nothing to opt out of.</p>
                <Link to="/register" className="btn-primary mt-8 h-12 px-7 text-base">{CTA}<Icon name="arrowRight" size="sm" /></Link>
              </div>
              <ul className="grid gap-px overflow-hidden rounded-3xl border border-stone-200/80 bg-stone-200/80 dark:border-stone-800 dark:bg-stone-800">
                {[
                  ['shield', 'No AI, ever', 'Notes are never read, summarized or used to train anything.'],
                  ['eyeOff', 'No tracking', 'No analytics, no ads, no third-party scripts.'],
                  ['lock', 'Locks and sessions', 'PIN-lock private notes; see and sign out of every device.'],
                  ['download', 'Leave any time', 'Export everything, or delete your account and data in one step.'],
                ].map(([i, t, d]) => (
                  <li key={t} className="flex gap-4 bg-white p-6 dark:bg-stone-900">
                    <Icon name={i} className="mt-0.5 shrink-0 text-accent" />
                    <div><p className="font-semibold">{t}</p><p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{d}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-stone-200/80 dark:border-stone-800">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_1.6fr]">
            <div className="reveal">
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-title" className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Questions<span className="text-accent">.</span></h2>
              <p className="mt-4 text-stone-600 dark:text-stone-400">Something else? <a className="font-medium text-stone-900 underline underline-offset-4 dark:text-white" href={`${GITHUB}/issues`} target="_blank" rel="noopener noreferrer">Ask on GitHub</a>.</p>
            </div>
            <div className="reveal divide-y divide-stone-200/80 border-y border-stone-200/80 dark:divide-stone-800 dark:border-stone-800">
              {FAQ.map(([q, a]) => (
                <details key={q} className="faq group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-medium sm:text-lg">
                    {q}<span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-stone-300 text-stone-500 transition group-open:rotate-45 dark:border-stone-700"><Icon name="plus" size="xs" /></span>
                  </summary>
                  <p className="-mt-1 pb-6 pr-12 leading-7 text-stone-600 dark:text-stone-400">{a}{q === 'Is the code open?' && <> <a className="font-medium text-stone-900 underline underline-offset-4 dark:text-white" href={GITHUB} target="_blank" rel="noopener noreferrer">View the repository</a>.</>}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-title" className="ink relative overflow-hidden bg-[#0d0b0a] text-white">
          <div aria-hidden="true" className="cta-glow pointer-events-none absolute inset-0" />
          <div className="reveal relative mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-24 sm:px-8 sm:py-28 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow !text-stone-400">Get started</p>
              <h2 id="cta-title" className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">The next thing you want to remember goes here<span className="text-accent">.</span></h2>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link to="/register" className="btn h-12 bg-white px-7 text-base font-medium text-stone-900 hover:bg-stone-200">{CTA}<Icon name="arrowRight" size="sm" /></Link>
              <Link to="/login" className="btn h-12 border border-white/20 px-7 text-base text-white hover:bg-white/10">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden border-t border-stone-200/80 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
          <div className="grid grid-cols-3 gap-x-6 gap-y-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="col-span-3 sm:col-span-1">
              <Logo className="text-2xl" />
              <p className="mt-3 max-w-xs text-sm leading-6 text-stone-600 dark:text-stone-400">Write it down. Find it later. A simple, private notes app with no AI and no clutter.</p>
              <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-5"><Icon name="github" size="sm" />Source on GitHub</a>
            </div>
            {[
              ['Product', [['#features', 'Features'], ['#shortcuts', 'Shortcuts'], ['#privacy', 'Privacy'], ['#faq', 'FAQ']]],
              ['Account', [['/register', CTA], ['/login', 'Log in']]],
              ['Project', [[GITHUB, 'GitHub'], [`${GITHUB}/issues`, 'Report an issue']]],
            ].map(([h, links]) => (
              <div key={h}>
                <p className="eyebrow">{h}</p>
                <ul className="mt-4 space-y-1 text-sm">
                  {links.map(([href, l]) => (
                    <li key={l}>{href.startsWith('/')
                      ? <Link to={href} className="inline-flex min-h-8 items-center text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white">{l}</Link>
                      : <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="inline-flex min-h-8 items-center text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white">{l}</a>}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col justify-between gap-2 border-t border-stone-200/80 pt-6 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-400 sm:flex-row">
            <p>© {new Date().getFullYear()} noted.</p>
            <p>No cookies for tracking. No AI. Just notes.</p>
          </div>
        </div>
        <div aria-hidden="true" className="wordmark pointer-events-none select-none whitespace-nowrap text-center font-semibold leading-[0.8] tracking-[-0.06em]" />
      </footer>
    </div>
  );
}
