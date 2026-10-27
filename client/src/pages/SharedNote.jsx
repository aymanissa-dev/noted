import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import NotFound from '../components/NotFound.jsx';
import { toHtml } from '../lib/markdown.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// A note someone shared with a public link: read-only, no account needed. The request carries
// no credentials (never the owner's or the viewer's session), Markdown is escaped before it's
// rendered, and images load from a share-scoped endpoint that only serves this note's images.
export default function SharedNote() {
  const { token } = useParams();
  const [state, setState] = useState({ status: TOKEN_RE.test(token || '') ? 'loading' : 'gone' });
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!TOKEN_RE.test(token || '')) { setState({ status: 'gone' }); return; }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fetch(`${BASE}/public/shares/${token}`, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) return setState({ status: 'gone' });
        if (res.status === 429) return setState({ status: 'busy' });
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ok', ...(await res.json()) });
      })
      .catch((e) => { if (e.name !== 'AbortError') setState({ status: 'error' }); });
    return () => ctrl.abort();
  }, [token]);

  // Never indexed (the server also sends X-Robots-Tag), and no referrer leaves this page.
  useEffect(() => {
    const prev = document.title;
    const set = (name, content) => {
      const m = document.head.querySelector(`meta[name=${name}]`) || document.head.appendChild(Object.assign(document.createElement('meta'), { name }));
      const old = m.content; m.content = content; return () => { m.content = old; };
    };
    const undoRobots = set('robots', 'noindex, nofollow, noarchive');
    const undoRef = set('referrer', 'no-referrer');
    return () => { undoRobots(); undoRef(); document.title = prev; };
  }, []);

  const note = state.note;
  useEffect(() => { if (note) document.title = `${note.title || 'Untitled'} · Noted`; else if (state.status === 'gone') document.title = 'Link not available · Noted'; }, [note, state.status]);

  const html = useMemo(() => (note ? toHtml(note.content || '') : ''), [note]);
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !note) return;
    const sizes = new Map((state.images || []).map((i) => [i._id, i]));
    root.querySelectorAll('img[data-noted-image]').forEach((img) => {
      const id = img.dataset.notedImage;
      const meta = sizes.get(id);
      if (!meta) { img.replaceWith(Object.assign(document.createElement('span'), { className: 'share-img-missing', textContent: img.alt ? `[Image: ${img.alt}]` : '[Image]' })); return; }
      if (meta.width && meta.height) { img.width = meta.width; img.height = meta.height; }
      img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.src = `${BASE}/public/shares/${token}/images/${id}`;
    });
    root.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer nofollow ugc'; });
  }, [html, note, state.images, token]);

  if (state.status === 'gone') return <NotFound title="This link doesn’t work any more" body="The owner may have stopped sharing this note, made a new link, or locked it." />;

  return (
    <div className="min-h-dvh bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200/80 bg-white/80 dark:border-stone-800 dark:bg-stone-900/60">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link to="/" aria-label="Noted home" className="rounded-md"><Logo className="text-[1.45rem]" /></Link>
          <span className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-muted dark:border-stone-700" data-testid="share-badge">Shared note · read-only</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {state.status === 'loading' && <p role="status" className="text-sm text-muted">Loading…</p>}
        {state.status === 'busy' && <p role="alert" className="text-sm text-muted" data-testid="share-busy">This note is getting a lot of visits. Try again in a few minutes.</p>}
        {state.status === 'error' && <p role="alert" className="text-sm text-muted" data-testid="share-error">Couldn’t load this note. Check your connection and refresh.</p>}
        {note && (
          <article data-testid="shared-note">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-4xl">
              {note.emoji && <span className="mr-2" aria-hidden="true">{note.emoji}</span>}{note.title || 'Untitled'}
            </h1>
            <p className="mt-2 text-xs text-muted">Updated {new Date(note.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
            <div ref={bodyRef} className="share-prose mt-8" data-testid="shared-body" dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        )}
      </main>
      <footer className="mx-auto max-w-3xl px-5 pb-12 text-center text-xs text-faint">
        <p>Shared with <Link to="/" className="font-medium text-stone-700 underline-offset-2 hover:underline dark:text-stone-300">Noted</Link>. Write it down. Find it later.</p>
      </footer>
    </div>
  );
}
