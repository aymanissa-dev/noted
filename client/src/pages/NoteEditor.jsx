import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { isTempId } from '../lib/offlineQueue.js';
import TagInput from '../components/TagInput.jsx';
import PinIcon from '../components/PinIcon.jsx';
import AppearancePicker from '../components/AppearancePicker.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { cardClass } from '../lib/colors.js';
import { timeAgo } from '../lib/format.js';

const AUTOSAVE_MS = 800;
const isEmpty = (n) => !n.title.trim() && !n.content.trim();
const snapshot = (n) => JSON.stringify({ title: n.title, content: n.content, tags: n.tags, color: n.color, emoji: n.emoji });

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState({ title: '', content: '', tags: [], pinned: false, archived: false, deletedAt: null, color: '', emoji: '' });
  const [noteId, setNoteId] = useState(routeId || null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [status, setStatus] = useState('idle'); // idle | dirty | saving | saved | error
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const lastSaved = useRef(snapshot(note));
  const inflight = useRef(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const idRef = useRef(noteId);
  idRef.current = noteId;

  useEffect(() => {
    if (!routeId || routeId === idRef.current && !loading) return;
    api.getNote(routeId)
      .then(({ note: n }) => {
        const loaded = { title: n.title, content: n.content, tags: n.tags, pinned: n.pinned, archived: n.archived, deletedAt: n.deletedAt, color: n.color || '', emoji: n.emoji || '' };
        lastSaved.current = snapshot(loaded);
        setNote(loaded); setNoteId(n._id); setUpdatedAt(n.updatedAt);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Save the current note if it changed. Serialized so creates never duplicate.
  const save = useCallback(async () => {
    if (inflight.current) await inflight.current.catch(() => {});
    const current = noteRef.current;
    const snap = snapshot(current);
    if (snap === lastSaved.current) { setStatus((s) => (s === 'dirty' ? 'saved' : s)); return; }
    if (!idRef.current && isEmpty(current)) return;
    setStatus('saving'); setError('');
    const run = (async () => {
      const { note: saved, queued } = idRef.current
        ? await api.updateNote(idRef.current, { title: current.title, content: current.content, tags: current.tags, color: current.color, emoji: current.emoji })
        : await api.createNote(current);
      lastSaved.current = snap;
      setUpdatedAt(saved.updatedAt);
      if (!idRef.current) {
        idRef.current = saved._id;
        setNoteId(saved._id);
        navigate(`/notes/${saved._id}`, { replace: true });
      }
      setStatus(snapshot(noteRef.current) !== snap ? 'dirty' : queued ? 'queued' : 'saved');
    })();
    inflight.current = run;
    try { await run; } catch (e) { setStatus('error'); setError(e.message); }
    finally { if (inflight.current === run) inflight.current = null; }
  }, [navigate]);

  // When an offline-created note syncs, switch to its real id.
  useEffect(() => {
    const onMapped = (e) => {
      if (e.detail.tempId !== idRef.current) return;
      idRef.current = e.detail.realId;
      setNoteId(e.detail.realId);
      navigate(`/notes/${e.detail.realId}`, { replace: true });
    };
    window.addEventListener('noted:id-mapped', onMapped);
    return () => window.removeEventListener('noted:id-mapped', onMapped);
  }, [navigate]);

  // Mark dirty immediately, autosave after a pause in typing.
  useEffect(() => {
    if (loading) return;
    if (snapshot(note) === lastSaved.current) return;
    setStatus('dirty');
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [note.title, note.content, note.tags, note.color, note.emoji, loading, save]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending changes when leaving the page.
  useEffect(() => () => { save(); }, [save]);
  useEffect(() => {
    const warn = (e) => { if (snapshot(noteRef.current) !== lastSaved.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape' && document.querySelector('[data-modal]')) { e.preventDefault(); setConfirmDelete(false); setHistoryOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const done = async () => { await save(); navigate(note.deletedAt ? '/trash' : note.archived ? '/archive' : '/'); };

  const togglePin = async () => {
    if (!noteId || isTempId(noteId)) return setNote((n) => ({ ...n, pinned: !n.pinned }));
    try {
      const { note: updated } = await api.togglePin(noteId);
      setNote((n) => ({ ...n, pinned: updated.pinned }));
    } catch (e) { setError(e.message); }
  };

  const openHistory = async () => { await save(); setHistoryOpen(true); };
  const applyRestored = (n) => {
    const restored = { ...noteRef.current, title: n.title, content: n.content, tags: n.tags, color: n.color || '', emoji: n.emoji || '' };
    lastSaved.current = snapshot(restored);
    setNote(restored); setUpdatedAt(n.updatedAt); setStatus('saved');
  };

  const toggleArchive = async () => {
    try {
      await save();
      const { note: updated } = await api.toggleArchive(idRef.current);
      setNote((n) => ({ ...n, archived: updated.archived, pinned: updated.pinned }));
      if (updated.archived) navigate('/');
    } catch (e) { setError(e.message); }
  };

  const moveToTrash = async () => {
    try {
      await save();
      await api.deleteNote(idRef.current);
      navigate('/');
    } catch (e) { setError(e.message); }
  };

  const restore = async () => {
    try { await api.restoreNote(noteId); setNote((n) => ({ ...n, deletedAt: null })); }
    catch (e) { setError(e.message); }
  };

  const deleteForever = async () => {
    try {
      lastSaved.current = snapshot(noteRef.current); // nothing to flush
      await api.deleteForever(noteId);
      navigate('/trash');
    } catch (e) { setError(e.message); setConfirmDelete(false); }
  };

  if (loading) return <p className="mt-16 text-center text-stone-400">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={done} className="btn-ghost -ml-3">← Back</button>
        <div className="flex items-center gap-1">
          <SaveStatus status={status} />
          <AppearancePicker color={note.color} emoji={note.emoji} onChange={(patch) => setNote((n) => ({ ...n, ...patch }))} />
          <button type="button" onClick={togglePin} title={note.pinned ? 'Unpin' : 'Pin'}
            className={`btn-ghost ${note.pinned ? 'text-amber-500' : ''}`}>
            <PinIcon filled={note.pinned} /><span className="ml-1.5">{note.pinned ? 'Pinned' : 'Pin'}</span>
          </button>
          {noteId && !isTempId(noteId) && (
            <button type="button" className="btn-ghost" onClick={openHistory} title="Version history">History</button>
          )}
          {noteId && !isTempId(noteId) && !note.deletedAt && (
            <button type="button" className="btn-ghost" onClick={toggleArchive}>{note.archived ? 'Unarchive' : 'Archive'}</button>
          )}
          {noteId && !isTempId(noteId) && !note.deletedAt && <button type="button" className="btn-danger" onClick={moveToTrash}>Delete</button>}
          {note.deletedAt && <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete forever</button>}
          <button type="button" className="btn-primary ml-1" onClick={done}>Done</button>
        </div>
      </div>

      {note.deletedAt && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          <span>This note is in the trash.</span>
          <button type="button" className="font-medium underline" onClick={restore}>Restore</button>
        </div>
      )}
      {note.archived && !note.deletedAt && (
        <div className="mb-3 rounded-xl bg-stone-100 dark:bg-stone-800 px-4 py-2 text-sm text-stone-600 dark:text-stone-300">Archived</div>
      )}
      <div className={`rounded-2xl border p-6 shadow-sm transition-colors ${cardClass(note.color)}`}>
        <input autoFocus={!routeId} className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-stone-300 dark:placeholder:text-stone-600"
          placeholder="Title" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        <div className="mt-3 border-b border-stone-100 dark:border-stone-800 pb-3">
          <TagInput tags={note.tags} onChange={(tags) => setNote({ ...note, tags })} />
        </div>
        <textarea className="mt-4 min-h-[50vh] w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-stone-300 dark:placeholder:text-stone-600"
          placeholder="Write it down…" value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{updatedAt ? `Edited ${timeAgo(updatedAt)}` : 'New note'}</span>
        <span>Saves automatically · ⌘/Ctrl + S</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {historyOpen && <HistoryPanel noteId={noteId} onRestored={applyRestored} onClose={() => setHistoryOpen(false)} />}
      {confirmDelete && (
        <div data-modal className="fixed inset-0 z-20 grid place-items-center bg-stone-900/30 dark:bg-black/60 px-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">Delete this note forever?</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">This can't be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={deleteForever}>Delete forever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ status }) {
  const map = {
    dirty: ['Unsaved', 'bg-stone-300'],
    saving: ['Saving…', 'bg-amber-400 animate-pulse'],
    saved: ['Saved', 'bg-emerald-500'],
    error: ['Not saved', 'bg-red-500'],
    queued: ['Saved offline', 'bg-sky-400'],
  };
  if (!map[status]) return null;
  const [label, dot] = map[status];
  return (
    <span className="mr-2 inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}
    </span>
  );
}
