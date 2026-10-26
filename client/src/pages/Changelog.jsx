import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Nav, SiteFooter, useReveal } from './Landing.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CHANGE_TYPES, RELEASES } from '../data/changelog.js';

// Public release notes, rendered from src/data/changelog.js (add a release there, not here).
const GITHUB = 'https://github.com/aymanissa-dev/noted';
const ORDER = ['new', 'improved', 'fixed', 'security'];
const DOT = { new: 'bg-accent', improved: 'bg-sky-500', fixed: 'bg-amber-500', security: 'bg-emerald-500' };
export const anchorFor = (version) => `v${String(version).replace(/\./g, '-')}`;
const fmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateLabel = (d) => fmt.format(new Date(`${d}T00:00:00Z`));

function Release({ r, latest }) {
  const id = anchorFor(r.version);
  const groups = ORDER.map((t) => [t, r.changes.filter((c) => c.type === t)]).filter(([, list]) => list.length);
  return (
    <li id={id} className="reveal scroll-mt-24 grid gap-5 border-b border-stone-200/80 py-12 last:border-b-0 dark:border-stone-800 sm:py-16 lg:grid-cols-[13rem_1fr] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-start">
          <a href={`#${id}`} className="inline-flex items-center rounded-full border border-stone-200 bg-white px-2.5 py-0.5 font-mono text-xs font-medium text-stone-800 shadow-soft transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-700" aria-label={`Link to version ${r.version}`}>v{r.version}</a>
          <time dateTime={r.date} className="font-mono text-xs uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">{dateLabel(r.date)}</time>
          {latest && <span className="rounded-full bg-stone-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white dark:bg-white dark:text-stone-900">Latest</span>}
        </div>
      </div>
      <article aria-labelledby={`${id}-title`} className="min-w-0">
        <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{r.title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600 dark:text-stone-400 sm:text-lg sm:leading-8">{r.summary}</p>
        <div className="mt-8 space-y-8">
          {groups.map(([type, list]) => (
            <section key={type} aria-labelledby={`${id}-${type}`}>
              <h3 id={`${id}-${type}`} className="eyebrow flex items-center gap-2"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[type]}`} />{CHANGE_TYPES[type]}</h3>
              <ul className="mt-3 space-y-2.5">
                {list.map((c) => (
                  <li key={c.text} className="relative pl-5 leading-7 text-stone-800 dark:text-stone-200">
                    <span aria-hidden="true" className="absolute left-0 top-[0.8rem] h-px w-2.5 bg-stone-300 dark:bg-stone-600" />{c.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {r.build && <p className="mt-8 font-mono text-[11px] text-stone-500 dark:text-stone-400">Build {r.build}</p>}
      </article>
    </li>
  );
}

export default function Changelog() {
  const { user } = useAuth();
  useReveal();
  // Deep links (/changelog#v1-4): the list renders after the browser tried to scroll, so do it now.
  useEffect(() => {
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { target.classList.add('in'); target.scrollIntoView(); }
  }, []);
  const latest = RELEASES[0];
  return (
    <div className="landing min-h-screen overflow-x-clip bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-stone-900">Skip to content</a>
      <Nav base="/" signedIn={Boolean(user)} />
      <main id="main">
        <section className="hero relative -mt-16 overflow-hidden pt-16">
          <div aria-hidden="true" className="hero-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-24">
            <p className="eyebrow hero-in">Changelog</p>
            <h1 className="hero-in mt-4 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">What’s new in noted<span className="text-accent">.</span></h1>
            <p className="hero-in mt-6 max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-400">Every improvement, fix and new feature, newest first. Small, steady releases; no AI, no clutter.</p>
            <div className="hero-in mt-8 flex flex-wrap items-center gap-3">
              <a href={`#${anchorFor(latest.version)}`} className="btn-primary">Latest: {latest.title}<Icon name="arrowRight" size="sm" /></a>
              <a href="/changelog.xml" className="btn-secondary" type="application/rss+xml"><Icon name="rss" size="sm" />RSS feed</a>
              <a href="/changelog.json" className="btn-ghost" type="application/feed+json">JSON feed</a>
            </div>
          </div>
        </section>

        <section aria-label="Releases" className="border-t border-stone-200/80 dark:border-stone-800">
          <ol className="mx-auto max-w-6xl px-5 sm:px-8" reversed>
            {RELEASES.map((r, i) => <Release key={r.version} r={r} latest={i === 0} />)}
          </ol>
        </section>

        <section aria-labelledby="changelog-cta" className="border-t border-stone-200/80 dark:border-stone-800">
          <div className="reveal mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 sm:py-20 md:flex-row md:items-center">
            <div>
              <h2 id="changelog-cta" className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Missing something<span className="text-accent">?</span></h2>
              <p className="mt-2 max-w-lg text-stone-600 dark:text-stone-400">Ideas and bug reports are welcome on GitHub.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href={`${GITHUB}/issues`} target="_blank" rel="noopener noreferrer" className="btn-secondary"><Icon name="github" size="sm" />Suggest a feature</a>
              {user
                ? <Link to="/notes" className="btn-primary">Open your notes<Icon name="arrowRight" size="sm" /></Link>
                : <Link to="/register" className="btn-primary">Start writing — it’s free<Icon name="arrowRight" size="sm" /></Link>}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter base="/" signedIn={Boolean(user)} />
    </div>
  );
}
