import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';

export default function HistoryPanel({ noteId, onRestored, onClose, unlockToken }) {
  const [versions, setVersions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, onClose);

  useEffect(() => {
    api.listVersions(noteId, { unlockToken })
      .then(({ versions }) => { setVersions(versions); if (versions[0]) setSelected(versions[0]._id); })
      .catch((e) => setError(e.message));
  }, [noteId, unlockToken]);

  useEffect(() => {
    if (!selected) return;
    setPreview(null);
    api.getVersion(noteId, selected, { unlockToken }).then(({ version }) => setPreview(version)).catch((e) => setError(e.message));
  }, [noteId, selected, unlockToken]);

  const restore = async () => {
    setBusy(true);
    try { const { note } = await api.restoreVersion(noteId, selected, { unlockToken }); onRestored(note); onClose(); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div data-modal className="fixed inset-0 z-30 grid place-items-center bg-stone-900/30 dark:bg-black/60 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-stone-900 shadow-xl outline-none">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 px-5 py-3">
          <h2 id="history-title" className="font-semibold">Version history</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
        {versions && versions.length === 0 ? (
          <p className="p-10 text-center text-sm text-stone-500 dark:text-stone-400">No earlier versions yet. Versions are saved every few minutes while you edit.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <ul className="max-h-40 overflow-y-auto border-b border-stone-200 dark:border-stone-800 sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r">
              {!versions && <li className="p-4 text-sm text-stone-400">Loading…</li>}
              {versions?.map((v) => (
                <li key={v._id}>
                  <button onClick={() => setSelected(v._id)}
                    className={`w-full px-4 py-2.5 text-left text-sm transition ${selected === v._id ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                    <div className="font-medium">{new Date(v.createdAt).toLocaleString()}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {timeAgo(v.createdAt)}{v.reason === 'restore' ? ' · before restore' : ''} · {v.length} chars
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-5">
                {preview ? (
                  <>
                    <h3 className="text-xl font-semibold">{preview.emoji && <span className="mr-1.5">{preview.emoji}</span>}{preview.title || 'Untitled'}</h3>
                    {preview.tags.length > 0 && <p className="mt-1 text-xs text-stone-500">{preview.tags.map((t) => `#${t}`).join(' ')}</p>}
                    <p className="mt-4 whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-stone-200">{preview.content}</p>
                  </>
                ) : selected && <p className="text-sm text-stone-400">Loading…</p>}
              </div>
              {preview && (
                <div className="flex justify-end gap-2 border-t border-stone-200 dark:border-stone-800 px-5 py-3">
                  <button className="btn-ghost" onClick={onClose}>Cancel</button>
                  <button className="btn-primary" onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Restore this version'}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
