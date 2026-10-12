import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import NoteCard from '../components/NoteCard.jsx';

export default function Dashboard() {
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listNotes({ search: query, tag })
      .then(({ notes }) => !cancelled && setNotes(notes))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [query, tag]);

  useEffect(() => {
    api.tags().then(({ tags }) => setTags(tags)).catch(() => {});
  }, []);

  const togglePin = async (note) => {
    try {
      const { note: updated } = await api.togglePin(note._id);
      setNotes((list) =>
        list.map((n) => (n._id === updated._id ? updated : n))
          .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)))
      );
    } catch (e) { setError(e.message); }
  };

  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="input pl-9" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Link to="/notes/new" className="btn-primary">+ New note</Link>
      </div>

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setTag('')}
            className={`chip ${!tag ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-500'}`}>All</button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? '' : t)}
              className={`chip ${tag === t ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-500'}`}>#{t}</button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading && notes.length === 0 ? (
        <p className="mt-16 text-center text-stone-400">Loading…</p>
      ) : notes.length === 0 ? (
        <div className="mt-20 text-center">
          <p className="text-lg font-medium text-stone-700">{query || tag ? 'No matching notes.' : 'Nothing here yet.'}</p>
          <p className="mt-1 text-sm text-stone-500">{query || tag ? 'Try a different search or tag.' : 'Write it down. Find it later.'}</p>
          {!query && !tag && <Link to="/notes/new" className="btn-primary mt-5">Write your first note</Link>}
        </div>
      ) : (
        <>
          {pinned.length > 0 && <Section title="Pinned" notes={pinned} onTogglePin={togglePin} />}
          {others.length > 0 && <Section title={pinned.length ? 'Others' : 'All notes'} notes={others} onTogglePin={togglePin} />}
        </>
      )}
    </div>
  );
}

function Section({ title, notes, onTogglePin }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => <NoteCard key={n._id} note={n} onTogglePin={onTogglePin} />)}
      </div>
    </section>
  );
}
