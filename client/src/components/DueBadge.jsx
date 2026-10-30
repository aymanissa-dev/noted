import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { dueState, formatDue, zoneOf } from '../lib/due.js';

// Re-render once a minute so "Today" / overdue styling stays true without a reload.
export function useMinuteTick() {
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((t) => t + 1), 60e3); return () => clearInterval(id); }, []);
}

const TONE = {
  overdue: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  soon: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
  later: 'bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700',
};

// The reminder on a note: "🔔 Tomorrow, 09:00", red once it's overdue. A button when onClick is given.
export default function DueBadge({ dueAt, onClick, className = '', testId = 'due-badge' }) {
  const { user } = useAuth();
  useMinuteTick();
  if (!dueAt) return null;
  const state = dueState(dueAt);
  const label = formatDue(dueAt, zoneOf(user));
  const text = state === 'overdue' ? `Overdue · ${label}` : label;
  const cls = `relative z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[state]} ${className}`;
  const aria = `Reminder: ${text}`;
  return onClick
    ? <button type="button" data-testid={testId} data-due-state={state} className={`${cls} transition hover:brightness-95`} aria-label={`${aria}. Change reminder`} onClick={onClick}><Icon name="bell" size="xs" />{text}</button>
    : <span data-testid={testId} data-due-state={state} className={cls} aria-label={aria} title={aria}><Icon name="bell" size="xs" />{text}</span>;
}
