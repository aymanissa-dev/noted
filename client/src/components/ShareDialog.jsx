import { useEffect, useRef, useState } from 'react';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';
import { useIsOnline } from '../lib/network.js';

export const shareUrl = (token) => `${window.location.origin}/s/${token}`;

// Copies text; falls back to selecting it (older browsers, denied permission).
export async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  if (input) { input.focus(); input.select(); try { return document.execCommand('copy'); } catch { return false; } }
  return false;
}

// Share a note through a public, read-only link. One link per note: create, copy, regenerate (the
// old link stops working), stop sharing. Locked notes can't be shared (remove the lock first).
export default function ShareDialog({ note, onClose, onChange }) {
  const online = useIsOnline();
  const [share, setShare] = useState(undefined); // undefined: loading, null: not shared
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(''); // 'rotate' | 'revoke'
  const inputRef = useRef(null);
  const locked = Boolean(note.locked);

  useEffect(() => {
    if (locked) { setShare(null); return; }
    let live = true;
    api.shareStatus(note._id).then((r) => { if (live) setShare(r.share); }).catch((e) => { if (live) { setShare(null); setError(e.message); } });
    return () => { live = false; };
  }, [note._id, locked]);

  const run = async (what, fn) => {
    setBusy(what); setError(''); setCopied(false);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); setConfirm(''); }
  };
  const create = () => run('create', async () => {
    const r = await api.createShare(note._id); setShare(r.share); onChange?.(r.share);
    if (await copyText(shareUrl(r.share.token))) setCopied(true);
  });
  const rotate = () => run('rotate', async () => { const r = await api.rotateShare(note._id); setShare(r.share); onChange?.(r.share); });
  const revoke = () => run('revoke', async () => { await api.revokeShare(note._id); setShare(null); onChange?.(null); });
  const copy = async () => { setCopied(await copyText(shareUrl(share.token), inputRef.current)); };

  const offlineNote = !online && <p className="mt-3 text-xs text-muted" id="share-offline">Sharing needs a connection.</p>;
  return (
    <Dialog title="Share note" description="Anyone with the link can read this note: its title, text and images. They can’t edit it, and nothing else of yours is visible."
      onClose={onClose} size="md" closeButton
      footer={<button type="button" className="btn-secondary" onClick={onClose}>Done</button>}>
      <div data-testid="share-dialog">
        {locked ? (
          <p className="flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2.5 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200"><Icon name="lock" className="mt-0.5 shrink-0" />Locked notes can’t be shared. Remove the lock first (More → Remove lock…).</p>
        ) : share === undefined ? (
          <p className="text-sm text-muted" role="status">Checking…</p>
        ) : share === null ? (
          <div>
            <button type="button" className="btn-primary" disabled={!online || Boolean(busy)} aria-describedby={!online ? 'share-offline' : undefined} onClick={create}>
              <Icon name="link" />{busy === 'create' ? 'Creating…' : 'Create link'}
            </button>
            {offlineNote}
          </div>
        ) : (
          <div>
            <label htmlFor="share-url" className="text-sm font-medium">Public link</label>
            <div className="mt-1 flex gap-2">
              <input id="share-url" ref={inputRef} className="input font-mono text-xs" readOnly value={shareUrl(share.token)} onFocus={(e) => e.target.select()} data-testid="share-url" />
              <button type="button" className="btn-primary shrink-0" onClick={copy} data-testid="share-copy"><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="mt-2 text-xs text-muted">Read-only. Hidden from search engines. It shows the note as it is now, including later edits; locking the note or moving it to the trash turns the link off.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
              {confirm ? (
                <>
                  <span className="mr-auto text-sm">{confirm === 'rotate' ? 'Make a new link? The current one stops working.' : 'Stop sharing? The link stops working right away.'}</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm('')}>Cancel</button>
                  <button type="button" className={`${confirm === 'revoke' ? 'btn-danger' : 'btn-secondary'} btn-sm`} disabled={Boolean(busy)} onClick={confirm === 'rotate' ? rotate : revoke}>
                    {confirm === 'rotate' ? (busy ? 'Making…' : 'New link') : (busy ? 'Stopping…' : 'Stop sharing')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-secondary btn-sm" disabled={!online} onClick={() => setConfirm('rotate')}><Icon name="refresh" size="xs" />Regenerate link</button>
                  <button type="button" className="btn-ghost btn-sm text-red-700 dark:text-red-400" disabled={!online} onClick={() => setConfirm('revoke')}>Stop sharing</button>
                </>
              )}
            </div>
            {offlineNote}
          </div>
        )}
        <p role="status" aria-live="polite" className="sr-only">{copied ? 'Link copied' : ''}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </Dialog>
  );
}
