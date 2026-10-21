import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import Kbd from './Kbd.jsx';

// Empty states that teach: a small picture of the feature (same style as the landing page demos),
// the shortcut for it, and a primary action that actually does something.
const card = 'rounded-xl border border-stone-200/80 bg-white px-3.5 py-3 text-left shadow-soft dark:border-stone-800 dark:bg-stone-900';
const line = (w) => <span className={`block h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 ${w}`} />;

function Picture({ kind, query }) {
  // Pictures are abstract on purpose (placeholder bars, no titles or dates) so they can't be
  // mistaken for real notes, e.g. next to an "Offline: showing the notes saved on this device" line.
  if (kind === 'archive') return (
    <div className="relative mx-auto w-64">
      <div className={`${card} flex items-center gap-3 opacity-80`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"><Icon name="archive" /></span>
        <div className="flex-1 space-y-1.5">{line('w-4/5')}{line('w-3/5')}</div>
      </div>
      <div className="menu absolute -bottom-10 -right-6 min-w-0 w-40 !animate-none p-1 text-xs">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-stone-500 dark:text-stone-400"><Icon name="history" size="xs" />Version history</div>
        <div className="flex items-center gap-2 rounded-md bg-accent/15 px-2 py-1.5 font-medium text-stone-900 dark:text-white"><Icon name="archive" size="xs" />Archive</div>
      </div>
    </div>
  );
  if (kind === 'trash') return (
    <div className={`${card} mx-auto flex w-72 items-center gap-3 border-dashed opacity-80`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"><Icon name="trash" /></span>
      <div className="min-w-0 flex-1 space-y-1.5">{line('w-3/4')}{line('w-1/3')}</div>
      <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 dark:border-stone-700 dark:text-stone-300"><Icon name="refresh" size="xs" />Restore</span>
    </div>
  );
  if (kind === 'search') return (
    <div className="mx-auto w-72 space-y-2">
      <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-left text-sm text-stone-700 shadow-soft dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"><Icon name="search" size="xs" className="text-faint" /><span className="truncate">{query}</span></div>
      <div className={`${card} opacity-60`}>{line('w-2/3')}<div className="mt-2">{line('w-1/2')}</div></div>
    </div>
  );
  if (kind === 'folder') return (
    <div className={`${card} mx-auto flex w-64 items-center gap-3`}>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"><Icon name="folder" /></span>
      <div className="flex-1 space-y-1.5">{line('w-3/4')}{line('w-1/2')}</div>
    </div>
  );
  if (kind === 'locked') return (
    <div className={`${card} mx-auto w-64`}><p className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-100"><Icon name="lock" size="xs" />Locked note</p><p className="mt-1 text-xs italic text-muted">Open it and enter your PIN.</p></div>
  );
  if (kind === 'missing') return (
    <div className={`${card} mx-auto w-64 border-dashed`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-500 dark:text-stone-400"><Icon name="search" size="xs" />No note at this link</p>
      <div className="mt-2 space-y-1.5 opacity-60">{line('w-4/5')}{line('w-1/2')}</div>
    </div>
  );
  if (kind === 'smart') return (
    <div className="mx-auto w-64 space-y-2">{[0, 1].map((i) => <div key={i} className={`${card} ${i ? 'opacity-50' : ''}`}>{line('w-2/3')}<div className="mt-2">{line('w-2/5')}</div></div>)}</div>
  );
  // first note: the quick-capture line
  return (
    <div className="mx-auto w-72 text-left">
      <div className="flex items-center gap-3 rounded-xl border border-accent/60 bg-white px-3.5 py-2.5 text-sm text-stone-800 shadow-soft ring-4 ring-accent/10 dark:bg-stone-900 dark:text-stone-100"><span className="h-3.5 w-0.5 rounded-full bg-accent" />Call the plumber <span className="text-accent">#home</span><kbd className="kbd kbd-sm ml-auto">↵</kbd></div>
    </div>
  );
}

export default function EmptyState({ kind, title, body, shortcuts = [], primary, secondary, query }) {
  const btn = (a, cls) => a && (a.to
    ? <Link to={a.to} className={cls}>{a.icon && <Icon name={a.icon} />}{a.label}</Link>
    : <button type="button" className={cls} onClick={a.onClick}>{a.icon && <Icon name={a.icon} />}{a.label}</button>);
  return (
    <div className="mx-auto mt-10 max-w-md px-2 text-center sm:mt-14" data-testid="empty-state" data-kind={kind}>
      <div aria-hidden="true" className="relative rounded-2xl border border-dashed border-stone-200 bg-[radial-gradient(circle_at_1px_1px,rgb(120_113_108/0.18)_1px,transparent_0)] bg-[length:16px_16px] px-6 pb-12 pt-8 dark:border-stone-800">
        <Picture kind={kind} query={query} />
      </div>
      <h2 className="mt-6 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{body}</p>
      {shortcuts.length > 0 && (
        <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted">
          {shortcuts.map(([combo, label]) => <li key={label} className="hidden items-center gap-1.5 sm:inline-flex"><Kbd combo={combo} size="sm" />{label}</li>)}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {btn(primary, 'btn-primary')}
        {btn(secondary, 'btn-ghost')}
      </div>
    </div>
  );
}
