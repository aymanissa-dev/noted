import { useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Choose the order and title for merging the selected notes.
export default function MergeDialog({ notes, onMerge, onCancel }) {
  const [order, setOrder] = useState(notes);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  useFocusTrap(ref, onCancel);
  const move = (i, d) => setOrder((o) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onMerge(order.map((n) => n._id), title.trim()); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div data-modal className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 px-4 dark:bg-black/60" onClick={onCancel}>
      <form ref={ref} role="dialog" aria-modal="true" aria-labelledby="merge-title" tabIndex={-1} onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900">
        <h2 id="merge-title" className="font-semibold">Merge {order.length} notes</h2>
        <p className="mt-1 text-sm text-muted">They’re combined into a new note in this order. The originals move to the trash.</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="merge-name">Title</label>
        <input id="merge-name" className="input mt-1" placeholder={`${order[0]?.title || 'Untitled'} (merged)`} value={title} onChange={(e) => setTitle(e.target.value)} />
        <ol className="mt-4 max-h-64 space-y-1.5 overflow-y-auto" aria-label="Merge order">
          {order.map((n, i) => (
            <li key={n._id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-800">
              <span className="w-5 text-xs text-faint">{i + 1}.</span>
              <span className="flex-1 truncate">{n.title || 'Untitled'}</span>
              <button type="button" className="btn-ghost px-1.5 py-0.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${n.title || 'Untitled'} up`}>↑</button>
              <button type="button" className="btn-ghost px-1.5 py-0.5" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${n.title || 'Untitled'} down`}>↓</button>
            </li>
          ))}
        </ol>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Merging…' : 'Merge'}</button>
        </div>
      </form>
    </div>
  );
}
