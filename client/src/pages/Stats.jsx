import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useRefetch, useIsOnline, isOfflineError } from '../lib/network.js';
import { Bar } from '../components/Skeleton.jsx';
import RetryStatus from '../components/RetryStatus.jsx';

const fmt = (n) => new Intl.NumberFormat().format(n);
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

function Tile({ label, value, hint }) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export default function Stats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const online = useIsOnline();
  const load = () => api.stats().then((x) => { setS(x); setError(''); })
    .catch((e) => setError(isOfflineError(e) || e instanceof TypeError ? 'network' : e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Back online, back to the tab, or (while it's failing) every few seconds: try again.
  useRefetch(load, { failing: Boolean(error), onFocus: 'always' });
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/settings" className="btn-ghost -ml-3">← Settings</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Storage</h1>
      <p className="text-sm text-muted">What’s in your notebook. Locked notes are counted but their words stay private.</p>
      <RetryStatus testId="stats-error" error={error === 'network' && !online ? 'offline' : error} onRetry={load} className="mt-4" />
      {!s && !error && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="surface p-4"><Bar className="h-3 w-16" /><Bar className="mt-3 h-6 w-12" /></div>)}</div>}
      {s && (
        <>
          <div data-testid="stats" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Notes" value={fmt(s.notes.active)} hint={`${fmt(s.notes.archived)} archived · ${fmt(s.notes.trashed)} in trash`} />
            <Tile label="Words" value={fmt(s.words)} hint={`${bytes(s.chars)} of text`} />
            <Tile label="Folders" value={fmt(s.folders)} />
            <Tile label="Tags" value={fmt(s.tags)} />
            <Tile label="Locked notes" value={fmt(s.notes.locked)} />
            <Tile label="Saved versions" value={fmt(s.versions)} />
            {s.audio && <Tile label="Voice notes" value={fmt(s.audio.count)} hint={bytes(s.audio.bytes)} />}
          </div>
          <section className="mt-8">
            <h2 className="section-label mb-2">Biggest notes</h2>
            {s.biggest.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : (
              <ol className="surface divide-y divide-stone-100 dark:divide-stone-800">
                {s.biggest.map((n) => (
                  <li key={n._id}><Link to={`/notes/${n._id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <span className="flex-1 truncate">{n.emoji && <span className="mr-1.5">{n.emoji}</span>}{n.title}</span>
                    <span className="tabular-nums text-muted">{fmt(n.words)} words</span>
                    <span className="hidden w-20 text-right tabular-nums text-faint sm:inline">{bytes(n.chars)}</span>
                  </Link></li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
