import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, optimisticInsert, saveOnUnload } from '../lib/api.js';
import { isTempId } from '../lib/offlineQueue.js';
import TagInput from '../components/TagInput.jsx';
import PinIcon from '../components/PinIcon.jsx';
import AppearancePicker from '../components/AppearancePicker.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import PinPrompt from '../components/PinPrompt.jsx';
import FolderPicker from '../components/FolderPicker.jsx';
import VoiceNotes from '../components/VoiceNotes.jsx';
import { EditorSkeleton, Bar } from '../components/Skeleton.jsx';
import EditorTools from '../editor/EditorTools.jsx';
import Icon from '../components/Icon.jsx';
import Menu from '../components/Menu.jsx';
import Dialog from '../components/Dialog.jsx';
import { toHtml } from '../lib/markdown.js';
import { dropUndo } from '../editor/undoStore.js';
import { loadEditor } from '../editor/preload.js';

const MarkdownEditor = lazy(loadEditor);
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { cardClass } from '../lib/colors.js';
import { timeAgo } from '../lib/format.js';

const AUTOSAVE_MS = 800;
const isEmpty = (n) => !n.title.trim() && !n.content.trim();
const toLoaded = (n) => ({ title: n.title, content: n.content, tags: n.tags, pinned: n.pinned, archived: n.archived, deletedAt: n.deletedAt, color: n.color || '', emoji: n.emoji || '', locked: Boolean(n.locked), folderId: n.folderId || null });
const snapshot = (n) => JSON.stringify({ title: n.title, content: n.content, tags: n.tags, color: n.color, emoji: n.emoji });

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  // Open instantly from a full cached copy (prefetched on hover, or opened before); refreshed below.
  const [initial] = useState(() => (routeId ? api.cachedNote(routeId) : null));
  const [note, setNote] = useState(() => (initial ? toLoaded(initial) : { title: '', content: '', tags: [], pinned: false, archived: false, deletedAt: null, color: '', emoji: '', locked: false, folderId: search.get('folder') || null }));
  const [noteId, setNoteId] = useState(routeId || null);
  const [updatedAt, setUpdatedAt] = useState(initial?.updatedAt || null);
  const [loading, setLoading] = useState(Boolean(routeId) && !initial);
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
  const [editorApi, setEditorApi] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  previewOnlyRef.current = previewOnly;

  const lastSaved = useRef(snapshot(note));
  // One id per editor visit: the server keeps a version at the start of each editing session.
  const session = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36)).current;
  const inflight = useRef(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const idRef = useRef(noteId);
  idRef.current = noteId;

  const revalidated = useRef(false);
  useEffect(() => {
    const refresh = initial && !revalidated.current && routeId === initial._id;
    revalidated.current = true;
    if (!routeId || (routeId === idRef.current && !loading && !refresh)) return;
    api.getNote(routeId)
      .then(({ note: n }) => {
        const loaded = toLoaded(n);
        if (refresh) {
          // Opened from cache: take the server copy only if it differs and you haven't started typing.
          if (snapshot(noteRef.current) !== lastSaved.current) return;
          if (snapshot(loaded) === lastSaved.current && n.updatedAt === initial.updatedAt && !n.locked) return;
        }
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
        ? await api.updateLockedNote(idRef.current, fields, unlockToken.current, { session })
        : idRef.current
        ? await api.updateNote(idRef.current, fields, { session })
        : await api.createNote({ ...current, folderId: current.folderId || undefined });
      lastSaved.current = snap;
      setUpdatedAt(saved.updatedAt);
      if (!idRef.current) {
        idRef.current = saved._id;
        setNoteId(saved._id);
        navigate(`/notes/${saved._id}`, { replace: true, state: { created: true } });
      }
      setStatus(snapshot(noteRef.current) !== snap ? 'dirty' : queued ? 'queued' : 'saved');
      window.dispatchEvent(new Event('noted:notes-changed'));
    })();
    inflight.current = run;
    try { await run; } catch (e) {
      setStatus('error');
      if (e.status === 423) { unlockToken.current = null; setNeedsPin(true); setError('Your unlock expired. Enter your PIN to keep saving.'); }
      else setError(e.message);
    }
    finally { if (inflight.current === run) inflight.current = null; }
  }, [navigate, session]);

  // When an offline-created note syncs, switch to its real id.
  useEffect(() => {
    const onMapped = (e) => {
      if (e.detail.tempId !== idRef.current) return;
      idRef.current = e.detail.realId;
      setNoteId(e.detail.realId);
      navigate(`/notes/${e.detail.realId}`, { replace: true, state: { created: true } });
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
    // Prompt whenever something isn't confirmed saved yet (Unsaved or Saving…). A keepalive save of the
    // latest state still goes out first, so the edit survives even if you leave anyway.
    const warn = (e) => {
      const unsaved = dirty() || Boolean(inflight.current);
      if (!unsaved) return;
      flush();
      e.preventDefault(); e.returnValue = '';
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

  // Moving between folders is immediate (not part of autosave); a new note takes its folder when first saved.
  const moveFolder = async (folderId) => {
    const prev = note.folderId;
    setNote((n) => ({ ...n, folderId }));
    if (!idRef.current || isTempId(idRef.current)) return;
    try { await api.moveToFolder(idRef.current, folderId); }
    catch (e) { setNote((n) => ({ ...n, folderId: prev })); setError(e.message); }
  };

  const unlock = async (pin, { beforeClose } = {}) => {
    const { note: n, unlockToken: token } = await api.unlockNote(idRef.current, pin);
    await beforeClose?.(); // the lock icon opens first
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
      const go = await dialog.confirm({ title: 'Set a PIN first', body: 'Locked notes open with a 4–6 digit PIN. You can set one in Settings; this note is saved before you go.', confirmLabel: 'Go to Settings', cancelLabel: 'Not now' });
      if (go) { await save(); navigate('/settings#lock-pin'); }
      return;
    }
    try {
      await save();
      await api.lockNote(idRef.current);
      dropUndo(user?.id, idRef.current); // locked notes never keep local undo history
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

  // The note as the list shows it, for putting it back instantly on Undo.
  const asListNote = (patch) => ({ _id: idRef.current, ...noteRef.current, updatedAt: updatedAt || new Date().toISOString(), createdAt: updatedAt, ...patch });
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
    const back = asListNote({ archived: false, deletedAt: null });
    toast.show('Note archived.', { action: { label: 'Undo', onClick: () => optimisticInsert(back, req.catch(() => {}).then(() => api.toggleArchive(id, false))).then(() => toast.show('Back in your notes.')).catch((e) => toast.show(`Couldn’t undo: ${e.message}`)) } });
    req.catch((e) => toast.show(`Couldn’t archive the note: ${e.message}`));
  };

  const moveToTrash = async () => {
    const id = idRef.current;
    await save();
    const req = api.deleteNote(id);
    navigate('/notes');
    const back = asListNote({ deletedAt: null });
    toast.show('Note moved to trash.', { action: { label: 'Undo', onClick: () => optimisticInsert(back, req.catch(() => {}).then(() => api.restoreNote(id))).then(() => toast.show('Note restored.')).catch((e) => toast.show(`Couldn’t undo: ${e.message}`)) } });
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

  // Focus mode: Esc leaves it (unless an editor popup like search or autocomplete used the key).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.cm-tooltip-autocomplete, .cm-search')) { e.preventDefault(); e.stopPropagation(); setFocusMode(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusMode]);

  const printHtml = useMemo(() => toHtml(note.content), [note.content]);
  const saved = Boolean(noteId) && !isTempId(noteId);
  const print = () => { save(); setTimeout(() => window.print(), 50); };
  const persist = !note.locked && noteId && !isTempId(noteId) && user?.id ? { userId: user.id, noteId } : null;

  if (loading) return <EditorSkeleton />;

  if (needsPin && !unlockToken.current && snapshot(note) === lastSaved.current && !note.content && !note.title) {
    return (
      <div className="mx-auto max-w-3xl xl:max-w-none">
        <Link to="/notes" className="btn-ghost -ml-2 gap-1 pl-2 pr-3"><Icon name="back" />Notes</Link>
        <PinPrompt inline onSubmit={unlock} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl xl:max-w-none">
      <div data-testid="editor-toolbar" className="sticky top-[var(--header-h)] z-[5] -mx-3 mb-4 flex items-center justify-between gap-2 bg-stone-50/90 px-3 py-2 backdrop-blur dark:bg-stone-950/90 sm:-mx-4 sm:px-4">
        <button type="button" onClick={done} className="btn-ghost -ml-2 min-w-11 gap-1 pl-2 pr-3" data-tip="Back to notes · Esc" data-tip-align="start" aria-label="Back to notes">
          <Icon name="back" /><span className="hidden sm:inline">Notes</span>
        </button>
        <div className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-1">
          <SaveStatus status={status} />
          <button type="button" onClick={togglePin} data-tip={note.pinned ? 'Unpin' : 'Pin to top'} aria-label={note.pinned ? 'Unpin' : 'Pin'} aria-pressed={note.pinned}
            className={`btn-ghost btn-icon ${note.pinned ? 'text-accent' : ''}`}><PinIcon filled={note.pinned} /></button>
          {!note.deletedAt && <FolderPicker value={note.folderId} onChange={moveFolder} />}
          <AppearancePicker color={note.color} emoji={note.emoji} onChange={(patch) => setNote((n) => ({ ...n, ...patch }))} />
          <Menu label="More actions" tip="More" testId="note-more" button={<Icon name="more" />}>
            {() => (
              <>
                {saved && <button role="menuitem" type="button" className="menu-item" aria-label="Version history" onClick={openHistory}><Icon name="history" />Version history</button>}
                {saved && !note.deletedAt && (note.locked
                  ? <button role="menuitem" type="button" className="menu-item" aria-label="Remove lock" onClick={() => setRemoveLockOpen(true)}><Icon name="unlock" />Remove lock…</button>
                  : <button role="menuitem" type="button" className="menu-item" aria-label="Lock with PIN" onClick={lockNote}><Icon name="lock" />Lock with PIN</button>)}
                <button role="menuitem" type="button" className="menu-item" aria-label="Print or save as PDF" onClick={print}><Icon name="printer" />Print or save as PDF</button>
                {saved && !note.deletedAt && <>
                  <div className="menu-sep" />
                  <button role="menuitem" type="button" className="menu-item" aria-label={note.archived ? 'Unarchive' : 'Archive'} onClick={toggleArchive}><Icon name="archive" />{note.archived ? 'Move out of archive' : 'Archive'}</button>
                  <button role="menuitem" type="button" className="menu-item text-red-700 dark:text-red-400" aria-label="Delete" onClick={moveToTrash}><Icon name="trash" />Move to trash</button>
                </>}
                {note.deletedAt && <>
                  <div className="menu-sep" />
                  <button role="menuitem" type="button" className="menu-item" onClick={restore}><Icon name="refresh" />Restore</button>
                  <button role="menuitem" type="button" className="menu-item text-red-700 dark:text-red-400" onClick={() => setConfirmDelete(true)}><Icon name="trash" />Delete forever…</button>
                </>}
              </>
            )}
          </Menu>
          <button type="button" className="btn-primary ml-1 px-3 sm:px-4" onClick={done} data-tip={`Save and close · Esc`} data-tip-align="end">Done</button>
        </div>
      </div>

      {note.deletedAt && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          <span>This note is in the trash. It’s deleted for good after 30 days.</span>
          <button type="button" className="btn-sm btn-secondary" onClick={restore}>Restore</button>
        </div>
      )}
      {previewOnly && (
        <div className="mb-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 px-4 py-2 text-sm text-sky-800 dark:text-sky-200">
          You’re offline and only a preview of this note is saved on this device. Reconnect to view and edit the full note.
        </div>
      )}
      {note.archived && !note.deletedAt && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200"><span className="inline-flex items-center gap-2"><Icon name="archive" />Archived. It’s out of your main list but still searchable here.</span><button type="button" className="btn-sm btn-secondary" onClick={toggleArchive}>Unarchive</button></div>
      )}
      <div data-testid="editor-card" className={focusMode
        ? 'fixed inset-0 z-40 overflow-y-auto bg-stone-50 px-4 py-10 dark:bg-stone-950 sm:px-8 sm:py-16'
        : `editor-card ${note.color ? '' : 'is-default'} rounded-2xl border p-4 sm:p-6 shadow-sm transition-colors ${cardClass(note.color)}`}>
        {/* A readable measure: the card grows with the screen, the text column stays ~70ch. */}
        <div className={focusMode ? 'mx-auto max-w-reading' : 'mx-auto max-w-[72ch]'}>
        {focusMode && <button type="button" onClick={() => setFocusMode(false)} className="btn-secondary btn-sm fixed right-4 top-4" aria-label="Exit focus mode">Exit focus <kbd className="kbd">Esc</kbd></button>}
        <input autoFocus={!routeId} aria-label="Title" className="w-full bg-transparent text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-stone-900 outline-none placeholder:text-stone-300 dark:text-stone-50 dark:placeholder:text-stone-600"
          placeholder="Title" readOnly={previewOnly} value={note.title} onChange={(e) => { const title = e.target.value; setNote((n) => ({ ...n, title })); }} />
        {!focusMode && (
        <div className="mt-3 border-b border-stone-100 dark:border-stone-800 pb-3">
          <TagInput tags={note.tags} onChange={(tags) => setNote((n) => ({ ...n, tags }))} />
          <EditorTools content={note.content} editor={editorApi} focusMode={focusMode} onFocusMode={setFocusMode} />
        </div>
        )}
        <Suspense fallback={<div className="mt-4 min-h-[50vh]"><Bar className="h-3.5 w-3/4" /><Bar className="mt-3 h-3.5 w-2/3" /></div>}>
          <MarkdownEditor value={note.content} readOnly={previewOnly} placeholder="Start writing… Type / for headings, checklists and more"
            persist={persist} focusMode={focusMode} onReady={setEditorApi}
            onChange={(content) => setNote((n) => ({ ...n, content }))} />
        </Suspense>
        {!focusMode && !previewOnly && !note.deletedAt && (!note.locked || unlockToken.current) && (
          <VoiceNotes noteId={noteId && !isTempId(noteId) ? noteId : null} unlockToken={unlockToken.current}
            ensureSaved={async () => { await save(); return idRef.current && !isTempId(idRef.current) ? idRef.current : null; }} />
        )}
        </div>
      </div>
      <div className="print-area" aria-hidden="true">
        <h1>{note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled'}</h1>
        {note.tags.length > 0 && <p className="print-tags">{note.tags.map((t) => `#${t}`).join('  ')}</p>}
        <div dangerouslySetInnerHTML={{ __html: printHtml }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-faint">
        <span>{updatedAt ? `Edited ${timeAgo(updatedAt)}` : 'New note'}</span>
        <span className="hidden sm:inline">Saves as you type</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {historyOpen && <HistoryPanel noteId={noteId} current={{ ...note, updatedAt }} unlockToken={unlockToken.current} onRestored={applyRestored} onClose={() => setHistoryOpen(false)} />}
      {needsPin && unlockToken.current === null && (snapshot(note) !== lastSaved.current || note.content || note.title) && (
        <PinPrompt title="Unlock expired" description="Enter your PIN to keep saving this note." onSubmit={unlock} />
      )}
      {removeLockOpen && (
        <PinPrompt title="Remove lock?" description="Enter your PIN. The note will be readable without a PIN." submitLabel="Remove lock"
          onSubmit={removeLock} onCancel={() => setRemoveLockOpen(false)} />
      )}
      {confirmDelete && (
        <Dialog role="alertdialog" title="Delete forever?" description={`“${note.title || 'Untitled'}” and its history will be gone for good. This can’t be undone.`}
          onClose={() => setConfirmDelete(false)}
          footer={<>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" data-confirm autoFocus className="btn-danger-solid" onClick={deleteForever}>Delete forever</button>
          </>} />
      )}
    </div>
  );
}

function SaveStatus({ status }) {
  // After a save, show a checkmark briefly, then settle to a quiet "Saved".
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (status !== 'saved') return undefined;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 1200);
    return () => clearTimeout(t);
  }, [status]);
  if (status === 'saved' && justSaved) {
    return (
      <span data-testid="save-status" data-state="saved-check" className="mr-1 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-emerald-600 dark:text-emerald-400 sm:mr-2" aria-live="polite" title="Saved">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-pop" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
        <span className="hidden min-[400px]:inline">Saved</span>
      </span>
    );
  }
  const map = {
    dirty: ['Unsaved', 'bg-stone-300'],
    saving: ['Saving…', 'bg-accent animate-soft-pulse'],
    saved: ['Saved', 'bg-emerald-500'],
    error: ['Not saved', 'bg-red-500'],
    queued: ['Saved offline', 'bg-sky-400'],
  };
  if (!map[status]) return null;
  const [label, dot] = map[status];
  return (
    <span data-testid="save-status" data-state={status} className="mr-1 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted sm:mr-2" aria-live="polite" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /><span className="hidden min-[400px]:inline">{label}</span>
    </span>
  );
}
