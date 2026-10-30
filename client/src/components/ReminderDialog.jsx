import { useState } from 'react';
import { Link } from 'react-router-dom';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDue, fromInputs, presets, toInputs, zoneOf } from '../lib/due.js';
import { askNotifyOnce } from '../lib/notify.js';

// Set, change or remove a note's reminder. Times are in the user's time zone (Settings → Reminders).
export default function ReminderDialog({ dueAt, onSave, onClose }) {
  const { user } = useAuth();
  const tz = zoneOf(user);
  const start = dueAt ? toInputs(dueAt, tz) : toInputs(presets(tz)[1][1], tz);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const iso = fromInputs(date, time, tz);
  const save = async (value) => {
    setBusy(true); setErr('');
    if (value) askNotifyOnce(); // from this click: browsers only allow the prompt after a user action
    try { await onSave(value); onClose(); } catch (e) { setErr(e.message || 'Couldn’t save the reminder.'); setBusy(false); }
  };
  return (
    <Dialog title={dueAt ? 'Reminder' : 'Set a reminder'} description="noted. reminds you here, and with a notification if you allow it." onClose={onClose}
      footer={<>
        {dueAt && <button type="button" className="btn-ghost mr-auto text-red-700 dark:text-red-400" disabled={busy} onClick={() => save(null)} data-testid="reminder-remove">Remove</button>}
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !iso} onClick={() => save(iso)} data-testid="reminder-save">Save</button>
      </>}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks">
        {presets(tz).map(([label, at]) => (
          <button key={label} type="button" className={`chip ${iso === at ? 'chip-on' : 'border-stone-300 text-stone-700 hover:border-stone-500 dark:border-stone-700 dark:text-stone-300'}`}
            onClick={() => { const v = toInputs(at, tz); setDate(v.date); setTime(v.time); }}>{label}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted">Date</span>
          <input type="date" className="input" value={date} required onChange={(e) => setDate(e.target.value)} data-testid="reminder-date" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted">Time</span>
          <input type="time" className="input" value={time} required onChange={(e) => setTime(e.target.value)} data-testid="reminder-time" /></label>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" data-testid="reminder-summary">
        <Icon name="bell" size="xs" />{iso ? formatDue(iso, tz) : 'Pick a date'}
        <span aria-hidden="true">·</span><Link to="/settings#reminders" className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-500" onClick={onClose}>{tz.replace(/_/g, ' ')}</Link>
      </p>
      {err && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{err}</p>}
    </Dialog>
  );
}
