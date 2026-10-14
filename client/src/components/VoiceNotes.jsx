import { useEffect, useRef, useState } from 'react';
import { audioApi } from '../lib/api.js';
import { useOnline } from '../lib/useOnline.js';
import { useDialog } from '../context/DialogContext.jsx';
import Icon from './Icon.jsx';

const MAX_SECONDS = 5 * 60;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pickType = () => ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';

function Clip({ clip, unlockToken, onDelete }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let u; let alive = true;
    audioApi.blobUrl(clip._id, unlockToken).then((x) => { u = x; if (alive) setUrl(x); else URL.revokeObjectURL(x); }).catch((e) => setError(e.message));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [clip._id, unlockToken]);
  return (
    <li className="flex items-center gap-2">
      {url ? <audio controls preload="metadata" src={url} className="h-9 min-w-0 flex-1" aria-label={`Voice note, ${fmt(clip.duration)}`} />
        : <span className="flex-1 text-xs text-muted">{error || 'Loading voice note…'}</span>}
      <span className="w-10 text-right text-xs tabular-nums text-faint">{fmt(clip.duration)}</span>
      <button type="button" className="btn-ghost btn-icon" onClick={() => onDelete(clip)} aria-label="Delete voice note" data-tip="Delete voice note" data-tip-align="end"><Icon name="trash" /></button>
    </li>
  );
}

// Record and play voice notes for a saved note (owner-only, private). Hidden for locked notes until unlocked.
export default function VoiceNotes({ noteId, unlockToken, ensureSaved }) {
  const { online } = useOnline();
  const dialog = useDialog();
  const [clips, setClips] = useState([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!noteId || !online) return;
    audioApi.list(noteId, unlockToken).then(({ clips }) => setClips(clips)).catch(() => {});
  }, [noteId, unlockToken, online]);
  useEffect(() => () => rec.current?.stop?.(), []);

  const start = async () => {
    setError('');
    const id = noteId || (await ensureSaved());
    if (!id) { setError('Write something first, then record.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError('Microphone access was blocked. Allow it in your browser to record.'); return; }
    const type = pickType();
    const mr = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 32000 });
    const chunks = []; const startedAt = Date.now();
    const tick = setInterval(() => {
      const s = (Date.now() - startedAt) / 1000; setElapsed(s);
      if (s >= MAX_SECONDS) mr.stop();
    }, 250);
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(tick); stream.getTracks().forEach((t) => t.stop());
      setRecording(false); rec.current = null;
      const duration = Math.min(MAX_SECONDS, (Date.now() - startedAt) / 1000);
      const blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
      if (!blob.size) return;
      setBusy(true);
      try { const { clip } = await audioApi.upload(id, blob, duration, unlockToken); setClips((c) => [...c, clip]); }
      catch (e) { setError(e.message); } finally { setBusy(false); }
    };
    rec.current = mr; mr.start(1000); setElapsed(0); setRecording(true);
  };
  const stop = () => rec.current?.stop();
  const remove = async (clip) => {
    if (!(await dialog.confirm({ title: 'Delete this voice note?', body: 'The recording is removed for good.', confirmLabel: 'Delete', danger: true }))) return;
    try { await audioApi.remove(clip._id, unlockToken); setClips((c) => c.filter((x) => x._id !== clip._id)); } catch (e) { setError(e.message); }
  };

  if (!supported && !clips.length) return null;
  return (
    <section aria-label="Voice notes" className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800 print:hidden">
      {clips.length > 0 && <ul className="mb-2 space-y-2">{clips.map((c) => <Clip key={c._id} clip={c} unlockToken={unlockToken} onDelete={remove} />)}</ul>}
      <div className="flex items-center gap-2">
        {supported && (recording
          ? <button type="button" onClick={stop} className="btn-ghost btn-sm text-red-700 dark:text-red-400"><span className="mr-1.5 h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" />Stop · {fmt(elapsed)} / 5:00</button>
          : <button type="button" onClick={start} disabled={!online || busy} className="btn-ghost btn-sm" data-tip-align="start" data-tip={online ? 'Record a voice note (up to 5 minutes)' : 'Voice notes need a connection'}>
              <Icon name="mic" size="xs" />
              {busy ? 'Saving…' : 'Record voice note'}
            </button>)}
        {!online && <span className="text-xs text-faint">Voice notes need a connection.</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}
