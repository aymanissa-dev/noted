import { Link } from 'react-router-dom';
import { timeAgo } from '../lib/format.js';
import PinIcon from './PinIcon.jsx';
import { cardClass } from '../lib/colors.js';
import { plainText } from '../lib/markdown.js';

export default function NoteCard({ note, onTogglePin, onRestore, onDeleteForever, compact, active }) {
  if (note.deletedAt) {
    return (
      <div className="flex flex-col rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 p-4">
        <h3 className="font-semibold text-stone-700 dark:text-stone-200 line-clamp-1 break-words">{note.locked ? '🔒 Locked note' : note.title || 'Untitled'}</h3>
        <p className="mt-1 flex-1 whitespace-pre-line text-sm text-stone-500 dark:text-stone-400 line-clamp-3">{plainText(note.content)}</p>
        <div className="mt-3 flex items-center gap-1">
          <span className="text-xs text-stone-400">Deleted {timeAgo(note.deletedAt)}</span>
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => onRestore(note)}>Restore</button>
          <button className="btn-danger px-2 py-1 text-xs" onClick={() => onDeleteForever(note)}>Delete forever</button>
        </div>
      </div>
    );
  }
  const optimistic = String(note._id).startsWith('optimistic-');
  const title = note.locked ? '🔒 Locked note' : note.title || 'Untitled';
  // The card is a real link (stretched over the card via ::after), so it works with touch, keyboard, and
  // middle-click. The pin button is a sibling stacked above the link, not nested inside it.
  return (
    <article className={`group relative flex flex-col rounded-xl border ${cardClass(note.color)} ${compact ? 'p-3' : 'p-4'} ${active ? 'ring-2 ring-accent' : ''} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] focus-within:ring-2 focus-within:ring-accent`}>
      <h3 className="pr-7 font-semibold text-stone-900 dark:text-stone-100 line-clamp-1 break-words">
        {optimistic ? (
          <span>{title}</span>
        ) : (
          <Link to={`/notes/${note._id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']">
            {!note.locked && note.emoji && <span className="mr-1.5" aria-hidden="true">{note.emoji}</span>}{title}
          </Link>
        )}
      </h3>
      {onTogglePin && (
        <button type="button"
          onClick={() => { if (!note.pending) onTogglePin(note); }}
          title={note.pinned ? 'Unpin' : 'Pin'} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={note.pinned}
          className={`absolute right-2 top-2 z-10 rounded-md p-2 transition focus:opacity-100 ${note.pinned ? 'text-accent' : 'text-stone-300 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-300 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'}`}>
          <PinIcon filled={note.pinned} />
        </button>
      )}
      <p className={`mt-1 flex-1 whitespace-pre-line break-words text-sm text-stone-600 dark:text-stone-300 ${compact ? "line-clamp-2" : "line-clamp-4"}`}>{note.locked ? <span className="italic text-stone-400">Enter your PIN to view.</span> : plainText(note.content)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-600 dark:text-stone-300">#{t}</span>
        ))}
        <span className="ml-auto text-xs text-stone-400">{note.pending ? 'Not synced' : timeAgo(note.updatedAt)}</span>
      </div>
    </article>
  );
}
