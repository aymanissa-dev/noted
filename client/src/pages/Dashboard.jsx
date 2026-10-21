import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlip } from '../lib/flip.js';
import { latestOnly } from '../lib/latest.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SMART, smartLabel } from '../lib/smart.js';
import { api, matchesList, readMeta } from '../lib/api.js';
import { preloadEditor } from '../editor/preload.js';
import Icon from '../components/Icon.jsx';
import NoteCard from '../components/NoteCard.jsx';
import QuickCapture from '../components/QuickCapture.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { ListSkeleton } from '../components/Skeleton.jsx';
import MergeDialog from '../components/MergeDialog.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useOnReconnect, useRefetch, isOfflineError } from '../lib/network.js';


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
    load(); window.addEventListener('noted:folders-changed', load); window.addEventListener('online', load);
    return () => { window.removeEventListener('noted:folders-changed', load); window.removeEventListener('online', load); };
  }, []);
  const folderName = folders.find((f) => f._id === folder)?.name;
  const [loading, setLoading] = useState(true); // a refresh is in flight (cached rows may be showing)
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  // Back online: drop the offline notices now and refetch (retried briefly; see useOnReconnect).
  useOnReconnect(() => { setOffline(false); setLoadError((e) => (e === 'offline' ? '' : e)); });
  useRefetch(() => setSyncTick((t) => t + 1), { failing: Boolean(loadError) || offline });
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
  const dialog = useDialog();
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
    window.addEventListener('noted:notes-changed', bump);
    return () => { window.removeEventListener('noted:queue-changed', bump); window.removeEventListener('noted:notes-changed', bump); };
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
        setLoadError(''); setOffline(Boolean(result.offline)); setLoading(false);
      })
      .catch((e) => { if (e?.name === 'AbortError') return; setLoadError(isOfflineError(e) ? 'offline' : e.message); setLoading(false); });
  }, [query, tag, folder, smart, view, syncTick, fetchList]);

  // Reset a tag filter whose tag no longer exists.
  useEffect(() => { if (tag && tags.length && !tags.includes(tag)) setTag(''); }, [tags, tag]);

  useEffect(() => {
    api.tags().then(({ tags }) => setTags(tags)).catch(() => {});
  }, [syncTick]);

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
    if (!(await dialog.confirm({ title: 'Delete forever?', body: `“${note.title || 'Untitled'}” and its history will be gone for good. This can’t be undone.`, confirmLabel: 'Delete forever', danger: true }))) return;
    try { await api.deleteForever(note._id); await removeAnimated(note._id); }
    catch (e) { setError(e.message); }
  };
  const emptyTrash = async () => {
    if (!(await dialog.confirm({ title: 'Empty the trash?', body: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} will be deleted for good. This can’t be undone.`, confirmLabel: 'Empty trash', danger: true }))) return;
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

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{isActive ? heading || 'All notes' : view === 'trash' ? 'Trash' : 'Archive'}</h1>
            {view === 'trash' && <p className="mt-0.5 text-sm text-muted">Notes here are deleted for good after 30 days.</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {view !== 'trash' && notes.length > 1 && (
              <button type="button" className="btn-ghost btn-sm sm:hidden" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Cancel' : 'Select'}</button>
            )}
            {isActive && (
              <select aria-label="Show" value={scope} onChange={(e) => pickScope(e.target.value)}
                className="input w-auto max-w-[10rem] py-1.5 lg:hidden">
                <option value="">All notes</option>
                <optgroup label="Smart">{SMART.map(([k, l]) => <option key={k} value={`smart:${k}`}>{l}</option>)}</optgroup>
                {folders.length > 0 && <optgroup label="Folders">{folders.map((f) => <option key={f._id} value={`folder:${f._id}`}>{f.name}</option>)}</optgroup>}
              </select>
            )}
          </div>
        </div>
      )}
      <div className={`flex gap-3 ${compact ? 'items-center' : 'flex-col sm:flex-row sm:items-center'}`}>
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="search" data-tour="search" type="search" aria-label="Search notes" className="input pl-9 pr-10" placeholder={view === 'trash' ? 'Search the trash…' : view === 'archive' ? 'Search the archive…' : 'Search notes…'} value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); e.stopPropagation(); setSearch(''); } }} />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"><Icon name="close" /></button>
          )}
        </div>
        {view !== 'trash' && !compact && notes.length > 1 && (
          <button type="button" className="btn-ghost hidden sm:inline-flex" aria-pressed={selecting} data-tip={selecting ? undefined : 'Select notes to merge'}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Cancel' : <><Icon name="select" />Select</>}</button>
        )}
        {isActive && <Link to={folder ? `/notes/new?folder=${folder}` : '/notes/new'} className={`btn-primary hidden sm:inline-flex ${compact ? 'btn-icon' : ''}`} data-tour="new" aria-label="New note" data-tip="New note · N" data-tip-align="end"><Icon name="plus" />{!compact && 'New note'}</Link>}
        {view === 'trash' && notes.length > 0 && <button className="btn-danger" onClick={emptyTrash}><Icon name="trash" />Empty trash</button>}
      </div>

      {isActive && !smart && !compact && <QuickCapture onCapture={capture} />}
      {(offline || loadError === 'offline') && <p role="status" data-testid="list-offline" className="mt-4 inline-flex items-center gap-2 text-xs text-muted"><Icon name="offline" size="xs" />{loadError === 'offline' ? 'You’re offline. This list loads when you reconnect.' : 'Offline: showing the notes saved on this device.'}</p>}
      {loadError && loadError !== 'offline' && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span className="inline-flex items-center gap-2"><Icon name="alert" />Couldn’t load your notes{notes.length ? '. Showing the last copy on this device' : ''}. {loadError}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setSyncTick((t) => t + 1)}>Try again</button>
        </div>
      )}

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
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div ref={listRef}>
      {loading && notes.length === 0 ? (
        <ListSkeleton />
      ) : notes.length === 0 ? (
        loadError && loadError !== 'offline' ? null : (
        <Empty compact={compact} view={view} query={query} tag={tag} folder={folder} smart={smart}
          clear={() => { setSearch(''); setTag(''); }} focusCapture={() => document.getElementById('quick-capture')?.focus()} />
        )
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
      <div className={`grid ${compact ? 'gap-2' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4'}`}>
        {notes.map((n) => <NoteCard key={n._id} leaving={leaving?.has(n._id)} entering={entering === n._id} note={n} compact={compact} active={n._id === activeId} selecting={selecting && !n.locked && !String(n._id).startsWith('optimistic-')} selectedIndex={selected.findIndex((x) => x._id === n._id)} onSelect={onSelect} onTogglePin={onTogglePin} onRestore={onRestore} onDeleteForever={onDeleteForever} />)}
      </div>
    </section>
  );
}

// What to show when a list is empty: teach the feature and offer the real next step.
function Empty({ compact, view, query, tag, folder, smart, clear, focusCapture }) {
  const newNote = { to: folder ? `/notes/new?folder=${folder}` : '/notes/new', label: 'New note', icon: 'plus' };
  let p;
  if (query || tag) p = { kind: 'search', title: 'No matches', body: `No notes match ${query ? `“${query}”` : `#${tag}`}. Try fewer words, another tag, or search the archive.`, primary: { onClick: clear, label: 'Clear search' }, secondary: newNote, shortcuts: [['Esc', 'clear search'], ['Mod+K', 'search everywhere']] };
  else if (folder) p = { kind: 'folder', title: 'This folder is empty', body: 'Create a note here, or open any note and use its folder button to move it in.', primary: { ...newNote, label: 'New note in this folder' }, secondary: { to: '/notes', label: 'All notes' }, shortcuts: [['N', 'new note']] };
  else if (smart === 'locked') p = { kind: 'locked', title: 'No locked notes', body: 'Lock a private note from its ••• menu (Lock with PIN). Set your PIN in Settings first.', primary: { to: '/settings', label: 'Set up a PIN', icon: 'lock' }, secondary: { to: '/notes', label: 'All notes' }, shortcuts: [['G S', 'settings']] };
  else if (smart) p = { kind: 'smart', title: 'Nothing here right now', body: 'Smart views fill themselves: notes show up here as soon as they match.', primary: newNote, secondary: { to: '/notes', label: 'All notes' }, shortcuts: [['N', 'new note'], ['G N', 'all notes']] };
  else if (view === 'archive') p = { kind: 'archive', title: 'Nothing archived', body: 'Archive notes you want to keep but not see every day: open a note, press •••, then Archive. They stay searchable here.', primary: { to: '/notes', label: 'Choose a note to archive', icon: 'archive' }, shortcuts: [['G A', 'open the archive'], ['G N', 'all notes']] };
  else if (view === 'trash') p = { kind: 'trash', title: 'Trash is empty', body: 'Deleted notes wait here for 30 days, so you can restore them. After that they’re gone for good.', primary: { to: '/notes', label: 'Back to notes' }, shortcuts: [['G T', 'open the trash'], ['G N', 'all notes']] };
  else p = { kind: 'first', title: 'No notes yet', body: 'Write your first note, or jot one line in quick capture above and press Enter.', primary: newNote, secondary: { onClick: focusCapture, label: 'Quick capture', icon: 'bolt' }, shortcuts: [['N', 'new note'], ['Q', 'quick capture'], ['?', 'all shortcuts']] };
  if (compact) {
    return (
      <div className="px-2 py-10 text-center text-sm" data-testid="empty-state" data-kind={p.kind}>
        <p className="font-medium text-stone-800 dark:text-stone-100">{p.title}</p>
        <p className="mt-1 text-xs text-muted">{p.body}</p>
      </div>
    );
  }
  return <EmptyState {...p} query={query} />;
}
