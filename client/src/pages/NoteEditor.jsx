import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imageApi, optimisticInsert, saveOnUnload, queue, realIdFor } from '../lib/api.js';
import { ImageLightbox, loadNoteImage } from '../components/Images.jsx';
import { forgetLockedImages, forgetNoteImages, primeImage } from '../lib/imageStore.js';
import { cleanAlt, splitImages } from '../lib/markdown.js';
import EmptyState from '../components/EmptyState.jsx';
import { isTempId } from '../lib/offlineQueue.js';
import { unlockFor } from '../lib/unlock.js';
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
import ShareDialog from '../components/ShareDialog.jsx';
import Menu from '../components/Menu.jsx';
import Dialog from '../components/Dialog.jsx';
import { toHtml, headings } from '../lib/markdown.js';
import { dropUndo } from '../editor/undoStore.js';
import { loadEditor } from '../editor/preload.js';

const MarkdownEditor = lazy(loadEditor);
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { cardClass } from '../lib/colors.js';
import { useClearOfflineMessage, useRefetch, useIsOnline, isNetworkText, isNetworkFailure, isOnline } from '../lib/network.js';
import { useTypewriter, toggleTypewriter, isTypewriterShortcut } from '../lib/typewriter.js';
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
  const [notFound, setNotFound] = useState(false);
  useClearOfflineMessage(setError);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Locked notes: content is only available after PIN entry; the unlock token authorizes saves for 15 min.
  const [needsPin, setNeedsPin] = useState(false);
  const [removeLockOpen, setRemoveLockOpen] = useState(false);
  const unlockToken = useRef(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const previewOnlyRef = useRef(false);
  const [editorApi, setEditorApi] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [outlineSheet, setOutlineSheet] = useState(false);
  const typewriter = useTypewriter();
  const online = useIsOnline();
  previewOnlyRef.current = previewOnly;

  const lastSaved = useRef(snapshot(note));
  // One id per editor visit: the server keeps a version at the start of each editing session.
  const session = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36)).current;
  const inflight = useRef(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const idRef = useRef(noteId);
  idRef.current = noteId;

  // The editor is only editable once this note's full body has come from the server during this
  // visit (`verified`). Until then a copy saved on this device is shown read-only — briefly while it
  // checks, or for as long as noted. can't be reached (blocked, offline) — and nothing is saved or
  // queued for it: a local copy may be stale or partial, and writing it back could wipe the note.
  // A local (not yet synced) note that's here is editable right away; any other /notes/local-… id is
  // looked up below, so an unknown one ends on "not found" instead of loading forever.
  const [verified, setVerified] = useState(() => !routeId || (isTempId(routeId) && Boolean(initial)));
  const verifiedRef = useRef(verified);
  // Couldn't load and there's no full copy here: say so (with a read-only list preview if there is one).
  const [loadFailed, setLoadFailed] = useState('');
  const [loadPreview, setLoadPreview] = useState(null);
  // Couldn't load, but a full copy saved on this device is showing (read-only).
  const [localCopy, setLocalCopy] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  const retryLoad = useRefetch(() => setLoadTick((t) => t + 1), { failing: Boolean(loadFailed) || localCopy });
  // Only the newest load attempt may update the view: a slow failure from before a reconnect must
  // not knock a note that has since loaded back into the read-only state.
  const loadSeq = useRef(0);

  // An old /notes/local-… link (history, a list rendered before the sync) of a note that has synced
  // since: go to the real note, replacing the local URL.
  useEffect(() => {
    const real = realIdFor(routeId);
    if (real && !queue.localNotes().some((n) => n._id === routeId)) navigate(`/notes/${real}`, { replace: true });
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!routeId || (routeId === idRef.current && verifiedRef.current)) return;
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current || (verifiedRef.current && routeId === idRef.current);
    api.getNote(routeId)
      .then(({ note: n }) => {
        if (seq !== loadSeq.current) return;
        const loaded = toLoaded(n);
        verifiedRef.current = true; setVerified(true);
        setLoadFailed(''); setLoadPreview(null); setLocalCopy(false);
        lastSaved.current = snapshot(loaded);
        setNote(loaded); setNoteId(n._id); setUpdatedAt(n.updatedAt);
        // Locked (perhaps on another device since this copy was cached): no copies of its images stay here.
        if (n.locked) { setNeedsPin(true); forgetNoteImages(n._id); }
        setPreviewOnly(Boolean(n.excerpt));
      })
      .catch((e) => {
        if (stale()) return;
        if (e.movedTo) { navigate(`/notes/${e.movedTo}`, { replace: true }); return; } // a local id that has synced
        if (e.status === 404 || e.status === 400 || e.status === 403) { setNotFound(true); return; }
        const local = e.local || initial;
        if (local) {
          const loaded = toLoaded(local);
          lastSaved.current = snapshot(loaded);
          setNote(loaded); setUpdatedAt(local.updatedAt);
          setLocalCopy(true); setLoadFailed('');
        } else { setLoadFailed(e.message || 'Couldn’t load this note.'); setLoadPreview(e.preview || null); }
      })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, loadTick]);
  const readOnly = previewOnly || !verified;

  const createdForImage = useRef(null); // id of a note created only to hold an image (see below)

  // Save the current note if it changed. Serialized so creates never duplicate.
  // forImage: create the note even while it's empty (an image is being added to it).
  const save = useCallback(async ({ forImage = false } = {}) => {
    if (inflight.current) await inflight.current.catch(() => {});
    const current = noteRef.current;
    const snap = snapshot(current);
    const createEmpty = forImage === true && !idRef.current;
    if (snap === lastSaved.current && !createEmpty) { setStatus((s) => (s === 'dirty' ? 'saved' : s)); return; }
    if (!idRef.current && isEmpty(current) && !createEmpty) return;
    if (current.locked && !unlockToken.current) return; // wait for PIN
    if (idRef.current && !isTempId(idRef.current) && !verifiedRef.current) return; // body never loaded: never overwrite it
    if (previewOnlyRef.current) return; // never save a truncated excerpt over the real note
    const imageOnly = createEmpty && isEmpty(current); // a note made only to hold an image
    setStatus('saving'); setError('');
    const run = (async () => {
      const fields = { title: current.title, content: current.content, tags: current.tags, color: current.color, emoji: current.emoji };
      const { note: saved, queued } = current.locked
        ? await api.updateLockedNote(idRef.current, fields, unlockToken.current, { session })
        : idRef.current
        ? await api.updateNote(idRef.current, fields, { session })
        : await api.createNote({ ...current, folderId: current.folderId || undefined, ...(imageOnly && { forImage: true }) }, { queueOffline: !imageOnly });
      lastSaved.current = snap;
      setUpdatedAt(saved.updatedAt);
      if (!idRef.current) {
        if (imageOnly && !queued) createdForImage.current = saved._id;
        idRef.current = saved._id;
        setNoteId(saved._id);
        navigate(`/notes/${saved._id}`, { replace: true, state: { created: true } });
      }
      setStatus(snapshot(noteRef.current) !== snap ? 'dirty' : queued ? 'queued' : 'saved');
      window.dispatchEvent(new Event('noted:notes-changed'));
    })();
    inflight.current = run;
    try { await run; } catch (e) {
      // The image couldn't get a note to go into (offline): the upload shows "Needs a connection"; the
      // note itself had nothing to save, so it isn't an editor error.
      if (imageOnly && isNetworkFailure(e)) { setStatus((st) => (st === 'saving' ? 'idle' : st)); return; }
      setStatus('error');
      if (e.status === 423) { unlockToken.current = null; setNeedsPin(true); setError('Your unlock expired. Enter your PIN to keep saving.'); }
      else setError(e.message);
    }
    finally { if (inflight.current === run) inflight.current = null; }
  }, [navigate, session]);

  // A note created just to hold an image whose upload then failed or was cancelled: if it's still
  // empty when you leave, it's deleted (no stray "Untitled" notes).
  useEffect(() => () => {
    const id = createdForImage.current;
    if (id && id === idRef.current && isEmpty(noteRef.current) && !noteRef.current.locked) {
      api.deleteForever(id).then(() => window.dispatchEvent(new Event('noted:notes-changed'))).catch(() => {});
    }
  }, []);

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
      if (!dirty() || !idRef.current || !verifiedRef.current) return;
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
    // Start fetching its images now, in parallel with the unlock animation, so they're ready (or
    // nearly) when the editor shows them instead of each starting only once it's on screen.
    for (const { image } of splitImages(n.content || '')) if (image) loadNoteImage(image, { noteId: idRef.current, locked: true, unlockToken: token }).catch(() => {});
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
      const go = await dialog.confirm({ title: 'Set a PIN first', body: 'Locked notes open with a 6-digit PIN. You can set one in Settings; this note is saved before you go.', confirmLabel: 'Go to Settings', cancelLabel: 'Not now' });
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
    // Locked: the editor's unlock (15-minute window) covers this; once it has expired, ask again.
    let token;
    try { token = await unlockFor(dialog, noteRef.current, { action: 'move it to the trash', held: unlockToken.current }); }
    catch (e) { toast.show(`Couldn’t delete the note: ${e.message}`); return; }
    if (token === null) return;
    await save();
    const req = api.deleteNote(id, token);
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
      // Same rule as moving to the trash: the open unlock covers it, an expired one asks for the PIN.
      const token = await unlockFor(dialog, noteRef.current, { action: 'delete it for good', held: unlockToken.current });
      if (token === null) { setConfirmDelete(false); return; }
      await api.deleteForever(noteId, token);
      navigate('/trash');
    } catch (e) { setError(e.message); setConfirmDelete(false); }
  };

  // Alt+Shift+T toggles typewriter mode while a note is open (also in the palette and toolbar).
  useEffect(() => {
    const onKey = (e) => { if (isTypewriterShortcut(e)) { e.preventDefault(); const on = toggleTypewriter(); toast.show(on ? 'Typewriter mode on: the line you’re typing stays centered.' : 'Typewriter mode off.'); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus mode: Esc leaves it (unless an editor popup like search or autocomplete used the key).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.cm-tooltip-autocomplete, .cm-search')) { e.preventDefault(); e.stopPropagation(); setFocusMode(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusMode]);

  // ---- Images (editor/images.js asks this host for network, dialogs and the lightbox) ----
  const [lightbox, setLightbox] = useState(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const imageHost = useMemo(() => ({
    load: (id) => loadNoteImage(id, { noteId: idRef.current, locked: noteRef.current.locked, unlockToken: unlockToken.current }),
    canUpload: () => {
      if (!navigator.onLine || !onlineRef.current) return 'Needs a connection: images can be added when you’re back online.';
      if (noteRef.current.deletedAt) return 'Restore the note to add images.';
      return null;
    },
    upload: async (prepared, { onProgress, signal }) => {
      if (!isOnline()) throw Object.assign(new Error('Needs a connection: images can be added when you’re back online.'), { retryable: true });
      await save({ forImage: true });
      const id = idRef.current;
      if (!id || isTempId(id)) throw Object.assign(new Error('Needs a connection: the note has to be saved before images can be added.'), { retryable: true });
      return imageApi.upload(id, prepared.blob, { unlockToken: unlockToken.current, onProgress, signal });
    },
    prime: (id, blob) => primeImage(id, blob, { noteId: idRef.current, locked: noteRef.current.locked }),
    notify: (message) => toast.show(message),
    editAlt: (alt) => dialog.prompt({ title: 'Alt text', label: 'Describe the image for people who can’t see it', initial: alt, placeholder: 'e.g. Whiteboard sketch of the launch plan', confirmLabel: 'Save', validate: (v) => (cleanAlt(v).length > 200 ? 'Keep it under 200 characters' : null) }),
    view: (box) => setLightbox(box),
  }), [save, toast, dialog]);
  // Leaving a locked note: its images don't stay in memory.
  useEffect(() => () => { if (noteRef.current.locked) forgetLockedImages(); }, []);

  const printHtml = useMemo(() => toHtml(note.content), [note.content]);
  // Printing: fill in the images (fetched with auth) before the print dialog opens.
  const printRef = useRef(null);
  const fillPrintImages = () => Promise.all([...(printRef.current?.querySelectorAll('img[data-noted-image]') || [])].map((img) => imageHost.load(img.dataset.notedImage).then((u) => { img.src = u; return img.decode?.().catch(() => {}); }).catch(() => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: img.alt ? `[Image: ${img.alt}]` : '[Image]' })); })));
  const saved = Boolean(noteId) && !isTempId(noteId);
  const print = () => { save(); Promise.race([fillPrintImages(), new Promise((r) => setTimeout(r, 4000))]).then(() => setTimeout(() => window.print(), 50)); };
  const persist = !note.locked && noteId && !isTempId(noteId) && user?.id ? { userId: user.id, noteId } : null;

  if (loading) return <EditorSkeleton />;

  if (loadFailed) {
    return (
      <div data-testid="note-load-failed" className="mx-auto mt-16 max-w-md text-center">
        <Icon name="offline" className="mx-auto text-faint" />
        <h2 className="mt-3 text-lg font-semibold tracking-tight">Couldn’t load this note</h2>
        <p className="mt-1.5 text-sm text-muted">{loadPreview
          ? (online ? 'noted. didn’t answer. Showing a preview saved on this device. Trying again…' : 'You’re offline. Showing a preview saved on this device; the full note opens when you reconnect.')
          : (online ? 'noted. didn’t answer. Trying again…' : 'You’re offline and this note isn’t saved on this device yet. It opens when you reconnect.')}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={retryLoad}><Icon name="refresh" />Try again</button>
          <Link to="/notes" className="btn-ghost"><Icon name="back" />Back to notes</Link>
        </div>
        {loadPreview && (
          <div data-testid="note-load-preview" className="mt-8 rounded-xl border border-dashed border-stone-200 p-4 text-left dark:border-stone-800">
            <p className="text-xs text-faint">Preview saved on this device (may be shortened, read-only)</p>
            <p className="mt-2 font-semibold text-stone-800 dark:text-stone-100">{loadPreview.emoji ? `${loadPreview.emoji} ` : ''}{loadPreview.title || 'Untitled'}</p>
            {loadPreview.content && <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm text-muted">{loadPreview.content}{loadPreview.excerpt ? '…' : ''}</p>}
          </div>
        )}
      </div>
    );
  }

  // A deleted, mistyped or someone else's note: say so plainly instead of showing a blank editor.
  if (notFound) {
    return (
      <div data-testid="note-not-found">
        <EmptyState kind="missing" title="This note isn’t here"
          body="It may have been deleted for good, or the link points to a note in another account. Check Trash if you deleted it recently."
          primary={{ to: '/notes', label: 'Back to notes', icon: 'back' }}
          secondary={{ to: '/notes/new', label: 'New note', icon: 'plus' }} />
        <p className="mt-4 text-center text-sm"><Link to="/trash" className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:text-stone-200 dark:decoration-stone-600">Open Trash</Link></p>
      </div>
    );
  }

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
          {!readOnly && <AppearancePicker color={note.color} emoji={note.emoji} onChange={(patch) => setNote((n) => ({ ...n, ...patch }))} />}
          <Menu label="More actions" tip="More" testId="note-more" buttonClass="btn-ghost btn-icon text-stone-800 dark:text-stone-100" button={<Icon name="more" size="md" />}>
            {() => (
              <>
                <div className="sm:hidden">
                  <button role="menuitem" type="button" className="menu-item" onClick={() => setOutlineSheet(true)}><Icon name="outline" />Outline</button>
                  {!readOnly && !note.deletedAt && <button role="menuitem" type="button" className="menu-item" onClick={() => setTimeout(() => editorApi?.pickImage(), 50)}><Icon name="image" />Add image</button>}
                  <button role="menuitem" type="button" className="menu-item" onClick={() => setTimeout(() => editorApi?.openFind(), 50)}><Icon name="find" />Find and replace</button>
                  <button role="menuitem" type="button" className="menu-item" onClick={() => setFocusMode(true)}><Icon name="focus" />Focus mode</button>
                  <button role="menuitemcheckbox" aria-checked={typewriter} type="button" className="menu-item" onClick={toggleTypewriter}><Icon name="typewriter" />Typewriter mode{typewriter && <Icon name="check" size="xs" className="ml-auto text-accent" />}</button>
                  <div className="menu-sep" />
                </div>
                {saved && <button role="menuitem" type="button" className="menu-item" aria-label="Version history" onClick={openHistory}><Icon name="history" />Version history</button>}
                {saved && !note.deletedAt && (note.locked
                  ? <button role="menuitem" type="button" className="menu-item" aria-label="Remove lock" onClick={() => setRemoveLockOpen(true)}><Icon name="unlock" />Remove lock…</button>
                  : <button role="menuitem" type="button" className="menu-item" aria-label="Lock with PIN" onClick={lockNote}><Icon name="lock" />Lock with PIN</button>)}
                {saved && !note.deletedAt && <button role="menuitem" type="button" className="menu-item" aria-label="Share" onClick={() => setShareOpen(true)}><Icon name="link" />Share…</button>}
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
      {localCopy && (
        <div role="status" data-testid="note-local-copy" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm dark:border-stone-800 dark:bg-stone-900">
          <span className="inline-flex items-center gap-2 text-muted"><Icon name="offline" size="xs" />
            {online ? 'Couldn’t load this note. Showing the copy saved on this device, read-only. Trying again…' : 'Couldn’t load this note: you’re offline. Showing the copy saved on this device, read-only until you reconnect.'}</span>
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={retryLoad}>Try again</button>
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
        {/* A readable measure: the card grows with the screen, the text column stays ~70–80 characters (40rem). */}
        <div className={focusMode ? 'mx-auto max-w-reading' : 'mx-auto max-w-[40rem]'}>
        {focusMode && <button type="button" onClick={() => setFocusMode(false)} className="btn-secondary btn-sm fixed right-4 top-4" aria-label="Exit focus mode">Exit focus <kbd className="kbd">Esc</kbd></button>}
        <input autoFocus={!routeId} aria-label="Title" className="editor-title w-full bg-transparent text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-stone-900 outline-none placeholder:text-stone-300 dark:text-stone-50 dark:placeholder:text-stone-600"
          placeholder="Title" readOnly={readOnly} value={note.title} onChange={(e) => { const title = e.target.value; setNote((n) => ({ ...n, title })); }} />
        {!focusMode && (
        <div className="mt-3 border-b border-stone-100 dark:border-stone-800 pb-3" inert={readOnly ? '' : undefined}>
          <TagInput tags={note.tags} onChange={(tags) => setNote((n) => ({ ...n, tags }))} />
          {/* Phones: these live in the ··· menu, so there's a single toolbar row. */}
          <div className="hidden sm:block"><EditorTools content={note.content} editor={editorApi} canAddImage={!readOnly && !note.deletedAt} focusMode={focusMode} onFocusMode={setFocusMode} typewriter={typewriter} onTypewriter={toggleTypewriter} /></div>
        </div>
        )}
        <Suspense fallback={<div className="mt-4 min-h-[50vh]"><Bar className="h-3.5 w-3/4" /><Bar className="mt-3 h-3.5 w-2/3" /></div>}>
          <MarkdownEditor value={note.content} readOnly={readOnly} placeholder="Start writing… Type / for headings, checklists and more"
            persist={persist} focusMode={focusMode} typewriter={typewriter} onReady={setEditorApi} images={imageHost}
            onChange={(content) => setNote((n) => ({ ...n, content }))} />
        </Suspense>
        {!focusMode && !readOnly && !note.deletedAt && (!note.locked || unlockToken.current) && (
          <VoiceNotes noteId={noteId && !isTempId(noteId) ? noteId : null} unlockToken={unlockToken.current}
            ensureSaved={async () => { await save(); return idRef.current && !isTempId(idRef.current) ? idRef.current : null; }} />
        )}
        </div>
      </div>
      <div className="print-area" aria-hidden="true">
        <h1>{note.emoji ? `${note.emoji} ` : ''}{note.title || 'Untitled'}</h1>
        {note.tags.length > 0 && <p className="print-tags">{note.tags.map((t) => `#${t}`).join('  ')}</p>}
        <div ref={printRef} dangerouslySetInnerHTML={{ __html: printHtml }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-faint">
        <span>{updatedAt ? `Edited ${timeAgo(updatedAt)}` : 'New note'}</span>
        <span className="hidden sm:inline">Saves as you type</span>
      </div>
      {error && (isNetworkText(error)
        ? <p role="status" className="mt-3 inline-flex items-center gap-2 text-sm text-muted"><Icon name="offline" size="xs" />{error} Your changes are kept and sync when you’re back.</p>
        : <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>)}

      {outlineSheet && (
        <Dialog title="Outline" description="Jump to a heading." closeButton onClose={() => setOutlineSheet(false)}>
          {headings(note.content).length === 0
            ? <p className="text-sm text-muted">No headings yet. Type / at the start of a line and pick a heading.</p>
            : <div className="-mx-2 max-h-[60vh] overflow-y-auto">{headings(note.content).map((h) => (
              <button key={h.line} type="button" className="menu-item" style={{ paddingLeft: `${0.75 + (h.level - 1) * 0.875}rem` }}
                onClick={() => { setOutlineSheet(false); setTimeout(() => editorApi?.jumpToLine(h.line), 50); }}>{h.text || 'Untitled heading'}</button>
            ))}</div>}
        </Dialog>
      )}
      {lightbox && <ImageLightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {historyOpen && <HistoryPanel noteId={noteId} current={{ ...note, updatedAt }} unlockToken={unlockToken.current} onRestored={applyRestored} onClose={() => setHistoryOpen(false)} />}
      {needsPin && unlockToken.current === null && (snapshot(note) !== lastSaved.current || note.content || note.title) && (
        <PinPrompt title="Unlock expired" description="Enter your PIN to keep saving this note." onSubmit={unlock} />
      )}
      {removeLockOpen && (
        <PinPrompt title="Remove lock?" description="Enter your PIN. The note will be readable without a PIN." submitLabel="Remove lock"
          onSubmit={removeLock} onCancel={() => setRemoveLockOpen(false)} />
      )}
      {shareOpen && <ShareDialog note={{ ...note, _id: noteId }} onClose={() => setShareOpen(false)} />}
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
