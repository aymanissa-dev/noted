import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlip } from '../lib/flip.js';
import { latestOnly } from '../lib/latest.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SMART, smartLabel } from '../lib/smart.js';
import { api, matchesList, readMeta } from '../lib/api.js';
import { preloadEditor } from '../editor/preload.js';
import NoteCard from '../components/NoteCard.jsx';
import QuickCapture from '../components/QuickCapture.jsx';
import { ListSkeleton } from '../components/Skeleton.jsx';
import MergeDialog from '../components/MergeDialog.jsx';
import { useToast } from '../context/ToastContext.jsx';

const VIEWS = {
  active: { empty: 'No notes yet. Press N to write one.' },
  archive: { empty: 'Nothing archived. Archive a note to tuck it away.' },
  trash: { empty: 'Trash is empty. Deleted notes stay here for 30 days.' },
};

export default function Dashboard({ view = 'active', compact = false, activeId }) {
  const [params, setParams] = useSearchParams();
  // Stale-while-revalidate: paint the cached list immediately, then refresh from the server.
  const [notes, setNotes] = useState(() => api.cachedList({
    view, tag: view === 'active' ? params.get('tag') || '' : '', folder: view === 'active' ? params.get('folder') || '' : '', smart: view === 'active' ? params.get('smart') || '' : '',
  }) || []);
  const [tags, setTags] = useState(() => readMeta('tags') || []);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const tag = view === 'active' ? params.get('tag') || '' : '';
  const folder = view === 'active' ? params.get('folder') || '' : '';
  const smart = view === 'active' ? params.get('smart') || '' : '';
  const setTag = (t) => setParams((p) => { const n = new URLSearchParams(p); if (t) n.set('tag', t); else n.delete('tag'); return n; }, { replace: true });
  const [folders, setFolders] = useState(() => readMeta('folders') || []);
  // Warm the editor chunk while the browser is idle, so opening a note doesn't wait for it.
  useEffect(() => preloadEditor(), []);
  useEffect(() => {
    const load = () => api.folders().then(({ folders }) => setFolders(folders)).catch(() => {});
    load(); window.addEventListener('noted:folders-changed', load);
    return () => window.removeEventListener('noted:folders-changed', load);
  }, []);
  const folderName = folders.find((f) => f._id === folder)?.name;
  const [loading, setLoading] = useState(true); // a refresh is in flight (cached rows may be showing)
  const [error, setError] = useState('');
  const [syncTick, setSyncTick] = useState(0);
  const listRef = useRef(null);
  const [leaving, setLeaving] = useState(() => new Set());
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  const [entering, setEntering] = useState(null);
  useFlip(listRef, [notes, leaving]);
  // Shrink-fade a card, then drop it (the FLIP hook glides the rest into the gap).
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const removeAnimated = (id) => new Promise((resolve) => {
    if (reduceMotion()) { setNotes((l) => l.filter((n) => n._id !== id)); return resolve(); }
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => { setNotes((l) => l.filter((n) => n._id !== id)); setLeaving((s) => { const n = new Set(s); n.delete(id); return n; }); resolve(); }, 200);
  });
  // Multi-select (for merging). `selected` keeps click order.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [merging, setMerging] = useState(false);
  const toast = useToast();
  const toggleSelect = (n) => setSelected((s) => (s.some((x) => x._id === n._id) ? s.filter((x) => x._id !== n._id) : [...s, n]));
  const stopSelecting = () => { setSelecting(false); setSelected([]); };
  useEffect(() => { stopSelecting(); }, [view, folder, smart, tag]); // eslint-disable-line react-hooks/exhaustive-deps
  const merge = async (ids, title) => {
    const { note, trashed } = await api.mergeNotes(ids, title);
    setMerging(false); stopSelecting(); setSyncTick((t) => t + 1);
    window.dispatchEvent(new Event('noted:notes-changed'));
    toast.show(`Merged ${trashed.length} notes. Originals are in the trash.`, {
      action: { label: 'Undo', onClick: async () => {
        try {
          await Promise.all(trashed.map((id) => api.restoreNote(id)));
          await api.deleteNote(note._id);
          toast.show('Merge undone.'); setSyncTick((t) => t + 1); window.dispatchEvent(new Event('noted:notes-changed'));
        } catch (e) { toast.show(`Couldn’t undo: ${e.message}`); }
      } },
    });
    navigate(`/notes/${note._id}`);
  };

  // Undo after delete/archive: put the note back right away (the server confirms in the background).
  const filtersRef = useRef({});
  filtersRef.current = { search: query, tag, folder, smart, view };
  useEffect(() => {
    const onInsert = (e) => {
      const n = e.detail;
      if (!matchesList(n, filtersRef.current)) return;
      setEntering(n._id);
      setNotes((l) => [n, ...l.filter((x) => x._id !== n._id)].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt))));
    };
    window.addEventListener('noted:note-inserted', onInsert);
    return () => window.removeEventListener('noted:note-inserted', onInsert);
  }, []);

  useEffect(() => {
    const bump = () => setSyncTick((t) => t + 1);
    window.addEventListener('noted:queue-changed', bump);
    window.addEventListener('online', bump);
    window.addEventListener('noted:notes-changed', bump);
    return () => { window.removeEventListener('noted:queue-changed', bump); window.removeEventListener('online', bump); window.removeEventListener('noted:notes-changed', bump); };
  }, []);

  // debounce search input; clearing it applies immediately
  useEffect(() => {
    const q = search.trim();
    if (!q) { setQuery(''); return; }
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Only the newest list request may update the UI (older ones are aborted / discarded).
  const fetchList = useMemo(() => latestOnly((params, signal) => api.listNotes(params, signal)), []);
  useEffect(() => () => fetchList.cancel(), [fetchList]);

  useEffect(() => {
    setLoading(true);
    fetchList({ search: query, tag, folder, smart, view })
      .then(({ result, stale }) => {
        if (stale) return;
        // Keep optimistic quick-capture cards that a refetch raced past (they're replaced once saved).
        // Cards mid-exit animation stay put until they finish.
        setNotes((cur) => {
          const optimistic = cur.filter((n) => String(n._id).startsWith('optimistic-'));
          const next = optimistic.length ? [...optimistic, ...result.notes] : [...result.notes];
          cur.forEach((n, i) => { if (leavingRef.current.has(n._id) && !next.some((x) => x._id === n._id)) next.splice(Math.min(i, next.length), 0, n); });
          return next;
        });
        setError(''); setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [query, tag, folder, smart, view, syncTick, fetchList]);

  // Reset a tag filter whose tag no longer exists.
  useEffect(() => { if (tag && tags.length && !tags.includes(tag)) setTag(''); }, [tags, tag]);

  useEffect(() => {
    api.tags().then(({ tags }) => setTags(tags)).catch(() => {});
  }, []);

  const sortNotes = (list) => [...list].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
  // Optimistic pin: flip immediately, roll back if the server refuses.
  const togglePin = async (note) => {
    const flip = (pinned) => setNotes((list) => sortNotes(list.map((n) => (n._id === note._id ? { ...n, pinned } : n))));
    flip(!note.pinned);
    try { await api.togglePin(note._id); }
    catch (e) { flip(note.pinned); setError(e.message); }
  };

  // Optimistic quick capture: show the note immediately, then swap in the saved (or offline-queued) note.
  const capture = async (fields, rawText) => {
    const tempId = `optimistic-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic = { _id: tempId, ...fields, pinned: false, archived: false, deletedAt: null, color: '', emoji: '', createdAt: now, updatedAt: now, pending: true };
    setEntering(tempId);
    setNotes((l) => [optimistic, ...l].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt))));
    try {
      const { note } = await api.createNote(folder ? { ...fields, folderId: folder } : fields);
      setNotes((l) => l.map((n) => (n._id === tempId ? note : n)));
      setEntering((e) => (e === tempId ? note._id : e));
      if (fields.tags.length) api.tags().then(({ tags }) => setTags(tags)).catch(() => {});
    } catch (e) {
      setNotes((l) => l.filter((n) => n._id !== tempId));
      setError(`Couldn't save quick note: ${e.message}`);
      const input = document.getElementById('quick-capture');
      if (input && !input.value) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(input, rawText); input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  };

  const restore = async (note) => {
    const done = removeAnimated(note._id); // optimistic
    try { await api.restoreNote(note._id); await done; }
    catch (e) { setNotes((l) => [note, ...l]); setError(e.message); }
  };
  const deleteForever = async (note) => {
    if (!window.confirm('Delete this note forever? This can\'t be undone.')) return;
    try { await api.deleteForever(note._id); await removeAnimated(note._id); }
    catch (e) { setError(e.message); }
  };
  const emptyTrash = async () => {
    if (!window.confirm('Permanently delete everything in the trash?')) return;
    const previous = notes;
    setNotes([]); // optimistic
    try { await api.emptyTrash(); }
    catch (e) { setNotes(previous); setError(e.message); }
    finally { setSyncTick((t) => t + 1); } // refetch to confirm server state
  };

  const isActive = view === 'active';
  const grouped = isActive && !smart; // recent/smart lists keep their own order
  const pinned = grouped ? notes.filter((n) => n.pinned) : [];
  const others = grouped ? notes.filter((n) => !n.pinned) : notes;
  const heading = folder ? folderName || 'Folder' : smart ? smartLabel(smart) : tag ? `#${tag}` : null;
  // Mobile/tablet scope picker (desktop uses the sidebar).
  const scope = folder ? `folder:${folder}` : smart ? `smart:${smart}` : '';
  const pickScope = (v) => { const [k, id] = v.split(':'); navigate(v ? `/notes?${k}=${id}` : '/notes'); };
  const copy = VIEWS[view];

  return (
    <div>
      {isActive && !compact && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="truncate text-lg font-semibold">{heading || 'All notes'}</h1>
          <select aria-label="Show" value={scope} onChange={(e) => pickScope(e.target.value)}
            className="input w-auto max-w-[11rem] py-1.5 lg:hidden">
            <option value="">All notes</option>
            <optgroup label="Smart">{SMART.map(([k, l]) => <option key={k} value={`smart:${k}`}>{l}</option>)}</optgroup>
            {folders.length > 0 && <optgroup label="Folders">{folders.map((f) => <option key={f._id} value={`folder:${f._id}`}>{f.name}</option>)}</optgroup>}
          </select>
        </div>
      )}
      <div className={`flex gap-3 ${compact ? 'items-center' : 'flex-col sm:flex-row sm:items-center'}`}>
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="search" type="search" className="input pl-9 pr-8" placeholder="Search notes…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); e.stopPropagation(); setSearch(''); } }} />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">✕</button>
          )}
        </div>
        {isActive && <Link to={folder ? `/notes/new?folder=${folder}` : '/notes/new'} className={`btn-primary hidden sm:inline-flex ${compact ? 'px-3' : ''}`} aria-label="New note">{compact ? '+' : '+ New note'}</Link>}
        {view === 'trash' && notes.length > 0 && <button className="btn-danger" onClick={emptyTrash}>Empty trash</button>}
        {view !== 'trash' && !compact && notes.length > 1 && (
          <button type="button" className="btn-ghost self-end py-1 text-xs sm:self-auto sm:py-2 sm:text-sm" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Cancel' : 'Select'}</button>
        )}
      </div>

      {isActive && !smart && !compact && <QuickCapture onCapture={capture} />}

      {isActive && !smart && !folder && tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
          <button onClick={() => setTag('')}
            className={`chip ${!tag ? 'chip-on' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-500'}`}>All</button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? '' : t)}
              className={`chip ${tag === t ? 'chip-on' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-500'}`}>#{t}</button>
          ))}
        </div>
      )}

      {selecting && (
        <div role="status" className="sticky top-[calc(var(--header-h)+0.5rem)] z-[6] mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white/95 px-4 py-2 text-sm shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
          <span>{selected.length ? `${selected.length} selected` : 'Select notes to merge'}</span>
          <button type="button" className="btn-primary py-1.5" disabled={selected.length < 2} onClick={() => setMerging(true)}>Merge{selected.length > 1 ? ` ${selected.length}` : ''}</button>
        </div>
      )}
      {merging && <MergeDialog notes={selected} onMerge={merge} onCancel={() => setMerging(false)} />}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div ref={listRef}>
      {loading && notes.length === 0 ? (
        <ListSkeleton />
      ) : notes.length === 0 ? (
        <div className="mt-20 text-center">
          <p className="text-muted">{query || tag ? `No notes match ${query ? `“${query}”` : `#${tag}`}.` : folder ? 'This folder is empty.' : smart ? 'Nothing here right now.' : copy.empty}</p>
          {(query || tag)
            ? <button type="button" className="btn-ghost mt-3" onClick={() => { setSearch(''); setTag(''); }}>Clear filters</button>
            : smart ? <Link to="/notes" className="btn-ghost mt-3">All notes</Link>
            : view === 'active' ? <Link to={folder ? `/notes/new?folder=${folder}` : '/notes/new'} className="btn-primary mt-4">New note</Link>
            : <Link to="/notes" className="btn-ghost mt-3">Back to notes</Link>}
        </div>
      ) : (
        <>
          {pinned.length > 0 && <Section leaving={leaving} entering={entering} selecting={selecting} selected={selected} onSelect={toggleSelect} compact={compact} activeId={activeId} title="Pinned" notes={pinned} onTogglePin={togglePin} />}
          {others.length > 0 && (
            <Section leaving={leaving} entering={entering} selecting={selecting} selected={selected} onSelect={toggleSelect} compact={compact} activeId={activeId} title={!isActive ? (view === 'trash' ? 'Trash' : 'Archived') : pinned.length ? 'Others' : heading ? 'Notes' : 'All notes'}
              notes={others} onTogglePin={isActive ? togglePin : undefined} onRestore={restore} onDeleteForever={deleteForever} />
          )}
        </>
      )}
      </div>
    </div>
  );
}

function Section({ title, notes, onTogglePin, onRestore, onDeleteForever, compact, activeId, selecting, selected = [], onSelect, leaving, entering }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 section-label">{title}</h2>
      <div className={`grid ${compact ? 'gap-2' : 'gap-4 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {notes.map((n) => <NoteCard key={n._id} leaving={leaving?.has(n._id)} entering={entering === n._id} note={n} compact={compact} active={n._id === activeId} selecting={selecting && !n.locked && !String(n._id).startsWith('optimistic-')} selectedIndex={selected.findIndex((x) => x._id === n._id)} onSelect={onSelect} onTogglePin={onTogglePin} onRestore={onRestore} onDeleteForever={onDeleteForever} />)}
      </div>
    </section>
  );
}
