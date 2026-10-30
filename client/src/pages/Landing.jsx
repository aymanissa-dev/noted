import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useTheme } from '../lib/theme.js';

// One label for every sign-up link on the page (hero, features, closing band, footer). The sticky
// header keeps a compact variant on purpose: it shares the bar with nav, theme and Log in.
const CTA = 'Start writing — it’s free';
const CTA_COMPACT = 'Start writing';

const GITHUB = 'https://github.com/aymanissa-dev/noted';
const SECTIONS = [['#features', 'Features'], ['#privacy', 'Privacy'], ['#faq', 'FAQ']];

// Fades sections in as they scroll into view (instantly visible with reduced motion or no IntersectionObserver).
export function useReveal() {
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

// Shared with the other public pages (e.g. /changelog): `base` prefixes the in-page section links.
export function Nav({ base = '', signedIn = false }) {
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
          <Link to="/" aria-label="noted. home"><Logo className="text-[1.6rem]" /></Link>
          {!signedIn && (
            <nav aria-label="Sections" className="hidden items-center gap-6 text-sm text-stone-600 dark:text-stone-400 md:flex">
              {SECTIONS.map(([h, l]) => <a key={h} href={base + h} className="transition hover:text-stone-900 dark:hover:text-white">{l}</a>)}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemePill />
          {signedIn
            ? <Link to="/notes" className="btn-primary">Open notes</Link>
            : <>
              <Link to="/login" className="btn-ghost">Log in</Link>
              <Link to="/register" className="btn-primary cta-lift hidden sm:inline-flex" data-cta="compact">{CTA_COMPACT}</Link>
            </>}
        </div>
      </div>
    </header>
  );
}

// The hero mockup: a tiny noted. window that plays once: notes slide in, a line types itself,
// then a search finds the right note. CSS only (no images, no video); still under reduced motion.
// Hero depth: the mockup leans back slightly and settles flat as you scroll, and turns a few degrees
// toward the pointer. Values ease toward their targets (a short rAF loop that stops once settled), so
// motion feels weighted rather than twitchy. Only CSS variables change; listeners are passive and the
// loop pauses off-screen. Nothing runs with reduced motion, and pointer tilt is skipped on touch.
function useDepth(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cur = { sp: 0, px: 0, py: 0 }; const tgt = { sp: 0, px: 0, py: 0 };
    let raf = 0; let visible = true;
    const ease = (t) => t * t * (3 - 2 * t); // smoothstep
    const tick = () => {
      raf = 0;
      let moving = false;
      for (const k of ['sp', 'px', 'py']) {
        const d = tgt[k] - cur[k];
        if (Math.abs(d) > 0.001) { cur[k] += d * 0.12; moving = true; } else cur[k] = tgt[k];
        el.style.setProperty(`--${k}`, cur[k].toFixed(4));
      }
      if (moving && visible) raf = requestAnimationFrame(tick);
    };
    const queue = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
    const onScroll = () => { tgt.sp = ease(Math.min(1, scrollY / (innerHeight * 0.55))); queue(); };
    const onMove = (e) => { tgt.px = (e.clientX / innerWidth) * 2 - 1; tgt.py = (e.clientY / innerHeight) * 2 - 1; queue(); };
    const onLeave = () => { tgt.px = 0; tgt.py = 0; queue(); };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) queue(); });
    io.observe(el);
    addEventListener('scroll', onScroll, { passive: true });
    if (fine) { addEventListener('pointermove', onMove, { passive: true }); document.documentElement.addEventListener('pointerleave', onLeave); }
    el.classList.add('depth-live');
    onScroll(); cur.sp = tgt.sp;
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave); };
  }, [ref]);
}

// Two paper notes floating at different depths beside the mockup (decorative; wide screens only).
const FLOATERS = [
  { cls: 'floater-a', z: 90, title: 'Ideas', body: 'Plant herbs on the balcony', tag: '#home' },
  { cls: 'floater-b', z: 140, title: 'Gate code', body: '4417, side entrance', tag: '📌 Pinned' },
];

function HeroMock() {
  const notes = [
    ['Trip ideas', 'Lisbon in May. Tram 28, pastel de nata…', true],
    ['Groceries', 'Milk, bread, lemons', false],
    ['Book list', 'The Overstory · Piranesi', false],
  ];
  return (
    <div aria-hidden="true" className="mock-stage relative mx-auto max-w-4xl text-left">
      <div className="mock-shadow" />
      <div className="mock-3d relative">
      {FLOATERS.map((f) => (
        <div key={f.cls} className={`floater ${f.cls}`} style={{ '--z': `${f.z}px` }}>
          <div className="floater-card">
            <p className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">{f.title}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-stone-500 dark:text-stone-400">{f.body}</p>
            {f.tag && <p className="mt-1.5 text-[10px] font-medium text-stone-400 dark:text-stone-500">{f.tag}</p>}
          </div>
        </div>
      ))}
      <div className="mock-window overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-lift dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-1.5 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-200 dark:bg-stone-700" /><span className="h-2.5 w-2.5 rounded-full bg-stone-200 dark:bg-stone-700" /><span className="h-2.5 w-2.5 rounded-full bg-stone-200 dark:bg-stone-700" />
          <span className="ml-3 font-mono text-[11px] text-stone-600 dark:text-stone-400">noted.</span>
        </div>
        <div className="grid sm:grid-cols-[15rem_1fr]">
          <div className="border-b border-stone-100 p-3 dark:border-stone-800 sm:border-b-0 sm:border-r">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm dark:border-stone-700">
              <Icon name="search" size="xs" className="text-stone-400" />
              <span className="mock-query text-stone-800 dark:text-stone-100">lisbon</span><span className="typing mock-query-caret" />
            </div>
            <ul className="mt-3 space-y-2">
              {notes.map(([t, b, hit], i) => (
                <li key={t} className={`mock-note rounded-lg border px-3 py-2 ${hit ? 'mock-hit' : 'mock-miss'} border-stone-200/80 dark:border-stone-800`} style={{ '--i': i }}>
                  <p className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">{t}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">{b}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative p-5 sm:p-7">
            <p className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-2xl">Trip ideas</p>
            <div className="mt-4 space-y-2.5 text-sm leading-6 text-stone-700 dark:text-stone-300 sm:text-[15px]">
              <p className="mock-type" style={{ '--d': '0.9s', '--n': 34 }}>Lisbon in May. Tram 28, pastel de nata.</p>
              <p className="mock-type" style={{ '--d': '2.1s', '--n': 30 }}>☐ Book flights by <b>Friday</b></p>
              <p className="mock-type" style={{ '--d': '3.1s', '--n': 26 }}>☐ Ask Sam about the Alfama flat<span className="typing" /></p>
            </div>
            <div className="mt-6 hidden gap-2 sm:flex"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">#travel</span></div>
          </div>
        </div>
      </div>
      <div className="preview-float pop-z absolute -right-2 -top-4 hidden items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-soft dark:border-stone-700 dark:bg-stone-800 dark:text-emerald-400 sm:inline-flex">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>Saved
      </div>
      <div className="preview-float preview-float-2 pop-z absolute -bottom-4 -left-2 hidden items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-soft dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 sm:inline-flex">
        <Icon name="lock" size="xs" />Only you can read this
      </div>
      </div>
    </div>
  );
}

// Three beats, each with a small illustration that plays when it scrolls into view.
const BEATS = [
  { id: 'write', icon: 'edit', title: 'Write', line: 'Open it and type.', body: 'No setup, no formatting to learn. A title, your words, saved as you type, even offline.',
    art: <div className="beat-art"><p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Call the plumber</p><p className="beat-type mt-1 text-xs text-stone-500 dark:text-stone-400">Tuesday, after 4pm<span className="typing" /></p><span className="beat-pop mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">✓ Saved</span></div> },
  { id: 'find', icon: 'search', title: 'Find', line: 'Search, and it’s there.', body: 'Titles, text and #tags, matched as you type. Pin the few notes you open every day.',
    art: <div className="beat-art"><div className="flex items-center gap-2 rounded-md border border-stone-200 px-2 py-1 text-xs dark:border-stone-700"><Icon name="search" size="xs" className="text-stone-400" /><span className="beat-type">wifi password</span></div><p className="beat-pop mt-2 rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-stone-800 dark:text-stone-100">Home stuff · <mark className="rounded bg-accent/40 px-0.5 text-inherit">wifi password</mark></p></div> },
  { id: 'privacy', icon: 'shield', title: 'Private', line: 'Yours, and only yours.', body: 'No AI reading your notes, no ads, no trackers. Lock a note with a PIN, share a read-only link only when you choose.',
    art: <div className="beat-art flex flex-col items-start gap-2"><span className="beat-pop inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-white dark:bg-white dark:text-stone-900"><Icon name="lock" size="xs" />Locked with PIN</span><span className="beat-pop beat-pop-2 inline-flex rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600 dark:border-stone-700 dark:text-stone-300">No AI · No ads · No trackers</span></div> },
];

const FAQ = [
  ['Is noted. free?', 'Yes. Create an account and start writing. There’s no paid tier and nothing to unlock.'],
  ['Does noted. use AI on my notes?', 'No. Nothing reads, summarizes or trains on what you write. No analytics or third-party trackers either.'],
  ['Can I use it offline?', 'Yes. Install it from your browser. Notes you’ve opened stay available offline, and your edits sync when you reconnect.'],
  ['Can I get my notes out?', 'Any time: Settings → Export gives you every note as JSON or a Markdown zip with your images.'],
];

export default function Landing() {
  useReveal();
  const hero = useRef(null);
  useDepth(hero);
  useEffect(() => { document.title = 'noted. — Write it down. Find it later.'; return () => { document.title = 'noted.'; }; }, []);
  return (
    <div className="landing min-h-screen overflow-x-clip bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-stone-900">Skip to content</a>
      <Nav />
      <main id="main">
        {/* Hero */}
        <section ref={hero} className="hero relative -mt-16 overflow-hidden pt-16">
          <div aria-hidden="true" className="hero-bg pointer-events-none absolute inset-0" />
          <div aria-hidden="true" className="hero-orb pointer-events-none absolute left-1/2 top-24 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full" />
          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-16 text-center sm:px-8 sm:pt-28">
            <h1 className="hero-in mx-auto max-w-4xl text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] [animation-delay:80ms] sm:text-7xl lg:text-[5.5rem]">
              Write it down.<br /><span className="marker">Find it later<span className="text-accent">.</span></span>
            </h1>
            <p className="hero-in mx-auto mt-6 max-w-lg text-balance text-lg leading-8 text-stone-600 [animation-delay:160ms] dark:text-stone-400 sm:text-xl">The calm, private place for everything you don’t want to forget.</p>
            <div className="hero-in mt-9 flex flex-col items-center justify-center gap-4 [animation-delay:240ms] sm:flex-row sm:gap-6">
              <Link to="/register" className="btn-primary cta-lift h-12 px-7 text-base">{CTA}<Icon name="arrowRight" size="sm" className="cta-arrow" /></Link>
              <Link to="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-950 hover:decoration-stone-500 dark:text-stone-400 dark:decoration-stone-600 dark:hover:text-white">I have an account</Link>
            </div>
            <p className="hero-in mt-5 text-xs font-medium tracking-wide text-stone-500 [animation-delay:300ms] dark:text-stone-400">Free <span aria-hidden="true" className="mx-1.5 text-stone-300 dark:text-stone-600">·</span> No AI on your notes <span aria-hidden="true" className="mx-1.5 text-stone-300 dark:text-stone-600">·</span> Works offline</p>
            <div className="mock-rise mt-14 sm:mt-16"><HeroMock /></div>
          </div>
        </section>

        {/* Three beats */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-16 border-t border-stone-200/70 bg-stone-100/60 dark:border-stone-800/70 dark:bg-stone-950">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="reveal mx-auto max-w-2xl text-center">
              <p className="eyebrow">How it works</p>
              <h2 id="features-title" className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">Three things, done well<span className="text-accent">.</span></h2>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {BEATS.map((b, i) => (
                <article key={b.id} id={b.id === 'privacy' ? 'privacy' : undefined} aria-labelledby={`beat-${b.id}`}
                  className="reveal beat beat-3d group scroll-mt-24 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-soft hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 sm:p-7"
                  style={{ transitionDelay: `${i * 90}ms` }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-stone-900 transition group-hover:scale-105 dark:text-stone-100"><Icon name={b.icon} /></span>
                    <h3 id={`beat-${b.id}`} className="text-lg font-semibold">{b.title}</h3>
                  </div>
                  <p className="mt-5 text-2xl font-semibold leading-tight tracking-tight">{b.line}</p>
                  <p className="mt-3 leading-7 text-stone-600 dark:text-stone-400">{b.body}</p>
                  <div aria-hidden="true" className="mt-6 rounded-2xl border border-stone-200/70 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/60" style={{ '--d': `${i * 0.15}s` }}>{b.art}</div>
                </article>
              ))}
            </div>
            <ul className="reveal mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-stone-600 dark:text-stone-400">
              {[['offline', 'Works offline'], ['download', 'Install it like an app'], ['link', 'Read-only share links'], ['upload', 'Export any time']].map(([ic, l]) => <li key={l} className="inline-flex items-center gap-1.5"><Icon name={ic} size="sm" />{l}</li>)}
            </ul>
            <div className="reveal mt-10 text-center">
              <Link to="/register" className="btn-primary cta-lift h-11 px-6">{CTA}<Icon name="arrowRight" size="sm" className="cta-arrow" /></Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.4fr]">
            <div className="reveal">
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-title" className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.035em]">Questions, answered<span className="text-accent">.</span></h2>
            </div>
            <div className="reveal faq divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium transition hover:text-stone-950 dark:hover:text-white">
                    {q}<Icon name="plus" size="sm" className="shrink-0 text-stone-500 transition-transform duration-300 group-open:rotate-45" />
                  </summary>
                  <p className="faq-answer pb-5 pr-8 leading-7 text-stone-600 dark:text-stone-400">{a}</p>
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
              <Link to="/register" className="btn cta-lift h-12 bg-white px-7 text-base font-medium text-stone-900 hover:bg-stone-200">{CTA}<Icon name="arrowRight" size="sm" className="cta-arrow" /></Link>
              <Link to="/login" className="btn cta-lift h-12 border border-white/20 px-7 text-base text-white hover:bg-white/10">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export function SiteFooter({ base = '', signedIn = false }) {
  return (
    <footer className="relative overflow-hidden border-t border-stone-200/80 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-900/40">
      <div className="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
        <div className="grid grid-cols-3 gap-x-6 gap-y-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-3 sm:col-span-1">
            <Logo className="text-2xl" />
            <p className="mt-3 max-w-xs text-sm leading-6 text-stone-600 dark:text-stone-400">Write it down. Find it later. The simplest private notes app: no AI, no clutter.</p>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-5"><Icon name="github" size="sm" />Source on GitHub</a>
          </div>
          {[
            ['Product', signedIn ? [['/changelog', 'Changelog'], ['/help', 'Help']] : [...SECTIONS.map(([h, l]) => [base + h, l]), ['/changelog', 'Changelog']]],
            ['Account', signedIn ? [['/notes', 'Open notes'], ['/settings', 'Settings']] : [['/register', CTA], ['/login', 'Log in']]],
            ['Project', [[GITHUB, 'GitHub'], [`${GITHUB}/issues`, 'Report an issue']]],
          ].map(([h, links]) => (
            <div key={h}>
              <p className="eyebrow">{h}</p>
              <ul className="mt-4 space-y-1 text-sm">
                {links.map(([href, l]) => (
                  <li key={l}>{href.startsWith('/') && !href.includes('#')
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
  );
}
