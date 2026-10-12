import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import TagInput from '../components/TagInput.jsx';
import PinIcon from '../components/PinIcon.jsx';
import { timeAgo } from '../lib/format.js';

export default function NoteEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [note, setNote] = useState({ title: '', content: '', tags: [], pinned: false });
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.getNote(id)
      .then(({ note }) => { setNote({ title: note.title, content: note.content, tags: note.tags, pinned: note.pinned }); setMeta(note); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const save = async (e) => {
    e?.preventDefault();
    if (!note.title.trim() && !note.content.trim()) return setError('Write something first.');
    setSaving(true); setError('');
    try {
      if (isNew) await api.createNote(note);
      else await api.updateNote(id, note);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const togglePin = async () => {
    if (isNew) return setNote((n) => ({ ...n, pinned: !n.pinned }));
    try {
      const { note: updated } = await api.togglePin(id);
      setNote((n) => ({ ...n, pinned: updated.pinned }));
    } catch (e) { setError(e.message); }
  };

  const remove = async () => {
    try { await api.deleteNote(id); navigate('/'); }
    catch (e) { setError(e.message); setConfirmDelete(false); }
  };

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) return <p className="mt-16 text-center text-stone-400">Loading…</p>;

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" className="btn-ghost -ml-3">← Back</Link>
        <div className="flex items-center gap-1">
          <button type="button" onClick={togglePin} title={note.pinned ? 'Unpin' : 'Pin'}
            className={`btn-ghost ${note.pinned ? 'text-amber-500' : ''}`}>
            <PinIcon filled={note.pinned} /><span className="ml-1.5">{note.pinned ? 'Pinned' : 'Pin'}</span>
          </button>
          {!isNew && <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="btn-primary ml-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <input autoFocus={isNew} className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-stone-300"
          placeholder="Title" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        <div className="mt-3 border-b border-stone-100 pb-3">
          <TagInput tags={note.tags} onChange={(tags) => setNote({ ...note, tags })} />
        </div>
        <textarea className="mt-4 min-h-[50vh] w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-stone-300"
          placeholder="Write it down…" value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{meta ? `Edited ${timeAgo(meta.updatedAt)}` : 'New note'}</span>
        <span>⌘/Ctrl + S to save</span>
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
    </form>
  );
}
