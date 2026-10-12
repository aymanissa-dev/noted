import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import TagInput from '../components/TagInput.jsx';
import PinIcon from '../components/PinIcon.jsx';
import { timeAgo } from '../lib/format.js';

const AUTOSAVE_MS = 800;
const isEmpty = (n) => !n.title.trim() && !n.content.trim();
const snapshot = (n) => JSON.stringify({ title: n.title, content: n.content, tags: n.tags });

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState({ title: '', content: '', tags: [], pinned: false });
  const [noteId, setNoteId] = useState(routeId || null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [status, setStatus] = useState('idle'); // idle | dirty | saving | saved | error
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        const loaded = { title: n.title, content: n.content, tags: n.tags, pinned: n.pinned };
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
      const { note: saved } = idRef.current
        ? await api.updateNote(idRef.current, { title: current.title, content: current.content, tags: current.tags })
        : await api.createNote(current);
      lastSaved.current = snap;
      setUpdatedAt(saved.updatedAt);
      if (!idRef.current) {
        idRef.current = saved._id;
        setNoteId(saved._id);
        navigate(`/notes/${saved._id}`, { replace: true });
      }
      setStatus(snapshot(noteRef.current) === snap ? 'saved' : 'dirty');
    })();
    inflight.current = run;
    try { await run; } catch (e) { setStatus('error'); setError(e.message); }
    finally { if (inflight.current === run) inflight.current = null; }
  }, [navigate]);

  // Mark dirty immediately, autosave after a pause in typing.
  useEffect(() => {
    if (loading) return;
    if (snapshot(note) === lastSaved.current) return;
    setStatus('dirty');
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [note.title, note.content, note.tags, loading, save]); // eslint-disable-line react-hooks/exhaustive-deps

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const done = async () => { await save(); navigate('/'); };

  const togglePin = async () => {
    if (!noteId) return setNote((n) => ({ ...n, pinned: !n.pinned }));
    try {
      const { note: updated } = await api.togglePin(noteId);
      setNote((n) => ({ ...n, pinned: updated.pinned }));
    } catch (e) { setError(e.message); }
  };

  const remove = async () => {
    try {
      lastSaved.current = snapshot(noteRef.current); // nothing to flush
      await api.deleteNote(noteId);
      navigate('/');
    } catch (e) { setError(e.message); setConfirmDelete(false); }
  };

  if (loading) return <p className="mt-16 text-center text-stone-400">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={done} className="btn-ghost -ml-3">← Back</button>
        <div className="flex items-center gap-1">
          <SaveStatus status={status} />
          <button type="button" onClick={togglePin} title={note.pinned ? 'Unpin' : 'Pin'}
            className={`btn-ghost ${note.pinned ? 'text-amber-500' : ''}`}>
            <PinIcon filled={note.pinned} /><span className="ml-1.5">{note.pinned ? 'Pinned' : 'Pin'}</span>
          </button>
          {noteId && <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="button" className="btn-primary ml-1" onClick={done}>Done</button>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <input autoFocus={!routeId} className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-stone-300"
          placeholder="Title" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        <div className="mt-3 border-b border-stone-100 pb-3">
          <TagInput tags={note.tags} onChange={(tags) => setNote({ ...note, tags })} />
        </div>
        <textarea className="mt-4 min-h-[50vh] w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-stone-300"
          placeholder="Write it down…" value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{updatedAt ? `Edited ${timeAgo(updatedAt)}` : 'New note'}</span>
        <span>Saves automatically · ⌘/Ctrl + S</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {confirmDelete && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-stone-900/30 px-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">Delete this note?</h2>
            <p className="mt-1 text-sm text-stone-500">This can't be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={remove}>Delete</button>
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
  };
  if (!map[status]) return null;
  const [label, dot] = map[status];
  return (
    <span className="mr-2 inline-flex items-center gap-1.5 text-xs text-stone-500" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}
    </span>
  );
}
