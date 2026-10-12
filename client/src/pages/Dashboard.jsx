import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import NoteCard from '../components/NoteCard.jsx';

const VIEWS = {
  active: { empty: 'Nothing here yet.', hint: 'Write it down. Find it later.' },
  archive: { empty: 'No archived notes.', hint: 'Archive notes you want to keep but not see every day.' },
  trash: { empty: 'Trash is empty.', hint: 'Deleted notes stay here for 30 days.' },
};

export default function Dashboard({ view = 'active' }) {
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const bump = () => setSyncTick((t) => t + 1);
    window.addEventListener('noted:queue-changed', bump);
    window.addEventListener('online', bump);
    return () => { window.removeEventListener('noted:queue-changed', bump); window.removeEventListener('online', bump); };
  }, []);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listNotes({ search: query, tag: view === 'active' ? tag : '', view })
      .then(({ notes }) => !cancelled && setNotes(notes))
      .then(() => !cancelled && setError(''))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [query, tag, view, syncTick]);

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

  const restore = async (note) => {
    try { await api.restoreNote(note._id); setNotes((l) => l.filter((n) => n._id !== note._id)); }
    catch (e) { setError(e.message); }
  };
  const deleteForever = async (note) => {
    if (!window.confirm('Delete this note forever? This can\'t be undone.')) return;
    try { await api.deleteForever(note._id); setNotes((l) => l.filter((n) => n._id !== note._id)); }
    catch (e) { setError(e.message); }
  };
  const emptyTrash = async () => {
    if (!window.confirm('Permanently delete everything in the trash?')) return;
    try { await api.emptyTrash(); setNotes([]); } catch (e) { setError(e.message); }
  };

  const isActive = view === 'active';
  const pinned = isActive ? notes.filter((n) => n.pinned) : [];
  const others = isActive ? notes.filter((n) => !n.pinned) : notes;
  const copy = VIEWS[view];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="search" className="input pl-9" placeholder="Search notes…  ( / )" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isActive && <Link to="/notes/new" className="btn-primary">+ New note</Link>}
        {view === 'trash' && notes.length > 0 && <button className="btn-danger" onClick={emptyTrash}>Empty trash</button>}
      </div>

      {isActive && tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setTag('')}
            className={`chip ${!tag ? 'chip-on' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-500'}`}>All</button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? '' : t)}
              className={`chip ${tag === t ? 'chip-on' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-500'}`}>#{t}</button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading && notes.length === 0 ? (
        <p className="mt-16 text-center text-stone-400">Loading…</p>
      ) : notes.length === 0 ? (
        <div className="mt-20 text-center">
          <p className="text-lg font-medium text-stone-700 dark:text-stone-200">{query || tag ? 'No matching notes.' : copy.empty}</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{query || tag ? 'Try a different search or tag.' : copy.hint}</p>
          {isActive && !query && !tag && <Link to="/notes/new" className="btn-primary mt-5">Write your first note</Link>}
        </div>
      ) : (
        <>
          {pinned.length > 0 && <Section title="Pinned" notes={pinned} onTogglePin={togglePin} />}
          {others.length > 0 && (
            <Section title={!isActive ? (view === 'trash' ? 'Trash' : 'Archived') : pinned.length ? 'Others' : 'All notes'}
              notes={others} onTogglePin={isActive ? togglePin : undefined} onRestore={restore} onDeleteForever={deleteForever} />
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, notes, onTogglePin, onRestore, onDeleteForever }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => <NoteCard key={n._id} note={n} onTogglePin={onTogglePin} onRestore={onRestore} onDeleteForever={onDeleteForever} />)}
      </div>
    </section>
  );
}
