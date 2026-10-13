import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, saveOnUnload } from '../lib/api.js';
import { isTempId } from '../lib/offlineQueue.js';
import TagInput from '../components/TagInput.jsx';
import PinIcon from '../components/PinIcon.jsx';
import AppearancePicker from '../components/AppearancePicker.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import PinPrompt from '../components/PinPrompt.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cardClass } from '../lib/colors.js';
import { timeAgo } from '../lib/format.js';

const AUTOSAVE_MS = 800;
const isEmpty = (n) => !n.title.trim() && !n.content.trim();
const snapshot = (n) => JSON.stringify({ title: n.title, content: n.content, tags: n.tags, color: n.color, emoji: n.emoji });

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState({ title: '', content: '', tags: [], pinned: false, archived: false, deletedAt: null, color: '', emoji: '', locked: false });
  const [noteId, setNoteId] = useState(routeId || null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [status, setStatus] = useState('idle'); // idle | dirty | saving | saved | error
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Locked notes: content is only available after PIN entry; the unlock token authorizes saves for 15 min.
  const [needsPin, setNeedsPin] = useState(false);
  const [removeLockOpen, setRemoveLockOpen] = useState(false);
  const unlockToken = useRef(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const previewOnlyRef = useRef(false);
  previewOnlyRef.current = previewOnly;

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
        const loaded = { title: n.title, content: n.content, tags: n.tags, pinned: n.pinned, archived: n.archived, deletedAt: n.deletedAt, color: n.color || '', emoji: n.emoji || '', locked: Boolean(n.locked) };
        lastSaved.current = snapshot(loaded);
        setNote(loaded); setNoteId(n._id); setUpdatedAt(n.updatedAt);
        if (n.locked) setNeedsPin(true);
        setPreviewOnly(Boolean(n.excerpt)); // offline and only a list excerpt is cached
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
    if (current.locked && !unlockToken.current) return; // wait for PIN
    if (previewOnlyRef.current) return; // never save a truncated excerpt over the real note
    setStatus('saving'); setError('');
    const run = (async () => {
      const fields = { title: current.title, content: current.content, tags: current.tags, color: current.color, emoji: current.emoji };
      const { note: saved, queued } = current.locked
        ? await api.updateLockedNote(idRef.current, fields, unlockToken.current)
        : idRef.current
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
    try { await run; } catch (e) {
      setStatus('error');
      if (e.status === 423) { unlockToken.current = null; setNeedsPin(true); setError('Your unlock expired. Enter your PIN to keep saving.'); }
      else setError(e.message);
    }
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
    const dirty = () => snapshot(noteRef.current) !== lastSaved.current;
    const fieldsOf = (n) => ({ title: n.title, content: n.content, tags: n.tags, color: n.color, emoji: n.emoji });
    // Fire a keepalive save of the latest state when the page is hidden or unloaded.
    const flush = () => {
      if (!dirty() || !idRef.current) return;
      if (noteRef.current.locked && !unlockToken.current) return;
      if (saveOnUnload(idRef.current, fieldsOf(noteRef.current), unlockToken.current)) lastSaved.current = snapshot(noteRef.current);
    };
    // Only prompt if there are changes that are neither saved, in flight, nor handed to a keepalive save.
    const warn = (e) => {
      if (!dirty() || inflight.current) return;
      flush();
      if (dirty()) { e.preventDefault(); e.returnValue = ''; }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape' && document.querySelector('[data-modal]')) { e.preventDefault(); setConfirmDelete(false); setHistoryOpen(false); setRemoveLockOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const done = async () => { await save(); navigate(note.deletedAt ? '/trash' : note.archived ? '/archive' : '/notes'); };

  const togglePin = async () => {
    if (!noteId || isTempId(noteId)) return setNote((n) => ({ ...n, pinned: !n.pinned }));
    try {
      const { note: updated } = await api.togglePin(noteId);
      setNote((n) => ({ ...n, pinned: updated.pinned }));
    } catch (e) { setError(e.message); }
  };

  const unlock = async (pin) => {
    const { note: n, unlockToken: token } = await api.unlockNote(idRef.current, pin);
    unlockToken.current = token;
    setNeedsPin(false); setError('');
    if (snapshot(noteRef.current) === lastSaved.current && !noteRef.current.content && !noteRef.current.title) {
      const loaded = { ...noteRef.current, title: n.title, content: n.content, tags: n.tags };
      lastSaved.current = snapshot(loaded);
      setNote(loaded);
    } else {
      save(); // re-unlocked mid-edit: keep local edits and save them
    }
  };

  const lockNote = async () => {
    if (!user?.hasLockPin) {
      if (window.confirm('Set a lock PIN in Settings first. Go to Settings now?')) { await save(); navigate('/settings'); }
      return;
    }
    try {
      await save();
      await api.lockNote(idRef.current);
      navigate('/notes');
    } catch (e) { setError(e.message); }
  };

  const removeLock = async (pin) => {
    await save();
    await api.removeNoteLock(idRef.current, pin);
    unlockToken.current = null;
    setNote((n) => ({ ...n, locked: false }));
    setRemoveLockOpen(false);
  };

  const openHistory = async () => { await save(); setHistoryOpen(true); };
  const applyRestored = (n) => {
    const restored = { ...noteRef.current, title: n.title, content: n.content, tags: n.tags, color: n.color || '', emoji: n.emoji || '' };
    lastSaved.current = snapshot(restored);
    setNote(restored); setUpdatedAt(n.updatedAt); setStatus('saved');
  };

  // Optimistic archive/trash: leave the editor right away, offer Undo, report failures in a toast.
  const toggleArchive = async () => {
    const id = idRef.current;
    const archiving = !note.archived;
    await save();
    if (!archiving) {
      setNote((n) => ({ ...n, archived: false }));
      api.toggleArchive(id, false).catch((e) => { setNote((n) => ({ ...n, archived: true })); setError(e.message); });
      return;
    }
    const req = api.toggleArchive(id, true);
    navigate('/notes');
    toast.show('Note archived.', { action: { label: 'Undo', onClick: () => req.then(() => api.toggleArchive(id, false)).then(() => toast.show('Note restored.')).catch((e) => toast.show(`Couldn’t undo: ${e.message}`)) } });
    req.catch((e) => toast.show(`Couldn’t archive the note: ${e.message}`));
  };

  const moveToTrash = async () => {
    const id = idRef.current;
    await save();
    const req = api.deleteNote(id);
    navigate('/notes');
    toast.show('Note moved to trash.', { action: { label: 'Undo', onClick: () => req.then(() => api.restoreNote(id)).then(() => { toast.show('Note restored.'); window.dispatchEvent(new Event('noted:queue-changed')); }).catch((e) => toast.show(`Couldn’t undo: ${e.message}`)) } });
    req.catch((e) => toast.show(`Couldn’t delete the note: ${e.message}`));
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

  if (needsPin && !unlockToken.current && snapshot(note) === lastSaved.current && !note.content && !note.title) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link to="/notes" className="btn-ghost -ml-3">← Back</Link>
        <PinPrompt inline onSubmit={unlock} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <button type="button" onClick={done} className="btn-ghost -ml-3">← Back</button>
        <div className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1">
          <SaveStatus status={status} />
          <AppearancePicker color={note.color} emoji={note.emoji} onChange={(patch) => setNote((n) => ({ ...n, ...patch }))} />
          <button type="button" onClick={togglePin} title={note.pinned ? 'Unpin' : 'Pin'}
            className={`btn-ghost ${note.pinned ? 'text-amber-500' : ''}`}>
            <PinIcon filled={note.pinned} /><span className="ml-1.5 hidden sm:inline">{note.pinned ? 'Pinned' : 'Pin'}</span>
          </button>
          {noteId && !isTempId(noteId) && !note.deletedAt && (
            note.locked
              ? <button type="button" className="btn-ghost" onClick={() => setRemoveLockOpen(true)} title="Remove lock" aria-label="Remove lock">🔓<span className="ml-1 hidden sm:inline">Unlock</span></button>
              : <button type="button" className="btn-ghost" onClick={lockNote} title="Lock with PIN" aria-label="Lock with PIN">🔒<span className="ml-1 hidden sm:inline">Lock</span></button>
          )}
          {noteId && !isTempId(noteId) && (
            <button type="button" className="btn-ghost" onClick={openHistory} title="Version history" aria-label="Version history">
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          {noteId && !isTempId(noteId) && !note.deletedAt && (
            <button type="button" className="btn-ghost" onClick={toggleArchive} title={note.archived ? 'Unarchive' : 'Archive'} aria-label={note.archived ? 'Unarchive' : 'Archive'}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>
              <span className="hidden sm:inline">{note.archived ? 'Unarchive' : 'Archive'}</span>
            </button>
          )}
          {noteId && !isTempId(noteId) && !note.deletedAt && <button type="button" className="btn-danger" onClick={moveToTrash} title="Delete" aria-label="Delete">
            <svg viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" /></svg>
            <span className="hidden sm:inline">Delete</span>
          </button>}
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
      {previewOnly && (
        <div className="mb-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 px-4 py-2 text-sm text-sky-800 dark:text-sky-200">
          You’re offline and only a preview of this note is saved on this device. Reconnect to view and edit the full note.
        </div>
      )}
      {note.archived && !note.deletedAt && (
        <div className="mb-3 rounded-xl bg-stone-100 dark:bg-stone-800 px-4 py-2 text-sm text-stone-600 dark:text-stone-300">Archived</div>
      )}
      <div className={`rounded-2xl border p-4 sm:p-6 shadow-sm transition-colors ${cardClass(note.color)}`}>
        <input autoFocus={!routeId} className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-stone-300 dark:placeholder:text-stone-600"
          placeholder="Title" readOnly={previewOnly} value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        <div className="mt-3 border-b border-stone-100 dark:border-stone-800 pb-3">
          <TagInput tags={note.tags} onChange={(tags) => setNote({ ...note, tags })} />
        </div>
        <textarea className="mt-4 min-h-[50vh] w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-stone-300 dark:placeholder:text-stone-600"
          placeholder="Write it down…" readOnly={previewOnly} value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{updatedAt ? `Edited ${timeAgo(updatedAt)}` : 'New note'}</span>
        <span className="hidden sm:inline">Saves automatically · ⌘/Ctrl + S</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {historyOpen && <HistoryPanel noteId={noteId} unlockToken={unlockToken.current} onRestored={applyRestored} onClose={() => setHistoryOpen(false)} />}
      {needsPin && unlockToken.current === null && (snapshot(note) !== lastSaved.current || note.content || note.title) && (
        <PinPrompt title="Unlock expired" description="Enter your PIN to keep saving this note." onSubmit={unlock} />
      )}
      {removeLockOpen && (
        <PinPrompt title="Remove lock?" description="Enter your PIN. The note will be readable without a PIN." submitLabel="Remove lock"
          onSubmit={removeLock} onCancel={() => setRemoveLockOpen(false)} />
      )}
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
    <span className="mr-1 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400 sm:mr-2" aria-live="polite" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /><span className="hidden min-[400px]:inline">{label}</span>
    </span>
  );
}
