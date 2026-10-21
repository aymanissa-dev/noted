import { Bar } from './Skeleton.jsx';
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { useOnReconnect, OFFLINE_MESSAGE } from '../lib/network.js';
import Icon from './Icon.jsx';

// `current` is the note as it is now (listed first, preview only); versions are earlier states.
export default function HistoryPanel({ noteId, onRestored, onClose, unlockToken, current }) {
  const [versions, setVersions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, onClose);

  const [retry, setRetry] = useState(0);
  useOnReconnect(() => { setError((e) => (e.includes(OFFLINE_MESSAGE) ? '' : e)); setRetry((r) => r + 1); });
  useEffect(() => {
    api.listVersions(noteId, { unlockToken })
      .then(({ versions }) => { setVersions(versions); setSelected((cur) => cur || versions[0]?._id || 'current'); })
      .catch((e) => setError(e.message));
  }, [noteId, unlockToken, retry]);

  useEffect(() => {
    if (!selected || selected === 'current') return;
    setPreview(null);
    api.getVersion(noteId, selected, { unlockToken }).then(({ version }) => setPreview(version)).catch((e) => setError(e.message));
  }, [noteId, selected, unlockToken]);

  const restore = async () => {
    setBusy(true);
    try { const { note } = await api.restoreVersion(noteId, selected, { unlockToken }); onRestored(note); onClose(); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div data-modal className="dialog-overlay" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="dialog-panel flex h-[80vh] max-w-4xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 px-5 py-3">
          <h2 id="history-title" className="font-semibold">Version history</h2>
          <button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {error && <p className="px-5 pt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        {(

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <ul className="max-h-40 overflow-y-auto border-b border-stone-200 dark:border-stone-800 sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r">
              {!versions && [0, 1, 2].map((i) => <li key={i} className="p-4"><Bar className="h-3.5 w-2/3" /><Bar className="mt-2 h-3 w-1/3" /></li>)}
              {versions && current && (
                <li>
                  <button onClick={() => setSelected('current')} data-testid="history-current"
                    className={`w-full px-4 py-2.5 text-left text-sm transition ${selected === 'current' ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                    <div className="font-medium">Current version</div>
                    <div className="text-xs text-muted">{current.updatedAt ? `Edited ${timeAgo(current.updatedAt)}` : 'Not saved yet'} · {current.content.length} chars</div>
                  </button>
                </li>
              )}
              {versions?.length === 0 && <li className="px-4 py-3 text-xs text-muted">No earlier versions yet. One is saved when you start editing, every few minutes, and after bigger changes.</li>}
              {versions?.map((v) => (
                <li key={v._id}>
                  <button onClick={() => setSelected(v._id)}
                    className={`w-full px-4 py-2.5 text-left text-sm transition ${selected === v._id ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                    <div className="font-medium">{new Date(v.createdAt).toLocaleString()}</div>
                    <div className="text-xs text-muted">
                      {timeAgo(v.createdAt)}{v.reason === 'restore' ? ' · before restore' : ''} · {v.length} chars
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-5">
                {selected === 'current' && current ? (
                  <>
                    <h3 className="text-xl font-semibold">{current.emoji && <span className="mr-1.5">{current.emoji}</span>}{current.title || 'Untitled'}</h3>
                    {current.tags.length > 0 && <p className="mt-1 text-xs text-stone-500">{current.tags.map((t) => `#${t}`).join(' ')}</p>}
                    <p className="mt-4 whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-stone-200">{current.content}</p>
                  </>
                ) : preview ? (
                  <>
                    <h3 className="text-xl font-semibold">{preview.emoji && <span className="mr-1.5">{preview.emoji}</span>}{preview.title || 'Untitled'}</h3>
                    {preview.tags.length > 0 && <p className="mt-1 text-xs text-stone-500">{preview.tags.map((t) => `#${t}`).join(' ')}</p>}
                    <p className="mt-4 whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-stone-200">{preview.content}</p>
                  </>
                ) : selected && <div><Bar className="h-5 w-1/2" /><Bar className="mt-4 h-3 w-full" /><Bar className="mt-2 h-3 w-4/5" /></div>}
              </div>
              {preview && selected !== 'current' && (
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
