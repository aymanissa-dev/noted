import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { displayTitle, unlockedPeek, useUnlockedVersion } from '../lib/unlocked.js';
import { timeAgo } from '../lib/format.js';
import PinIcon from './PinIcon.jsx';
import Icon from './Icon.jsx';
import DueBadge from './DueBadge.jsx';
import { cardClass } from '../lib/colors.js';
import { previewText } from '../lib/markdown.js';

export default function NoteCard({ note, onTogglePin, onRestore, onDeleteForever, onReveal, needsConnection = false, compact, active, selecting, selectedIndex = -1, onSelect, leaving, entering }) {
  useUnlockedVersion(); // a locked note unlocked elsewhere shows its title right away
  const motion = leaving ? 'animate-leave pointer-events-none' : entering ? 'animate-slide-in' : '';
  if (note.deletedAt) {
    return (
      <div data-flip-id={note._id} className={`${motion} flex flex-col rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 p-4`}>
        <h3 className="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-200 line-clamp-1 break-words">{note.locked ? <><Icon name="lock" />{displayTitle(note)}</> : note.title || 'Untitled'}</h3>
        {/* A locked note's title stays private on the server (lists, search, offline copies). In the
            trash the PIN shows it (title only, the body stays locked) until the lock comes back. */}
        {note.locked && !unlockedPeek(note._id) && onReveal && (
          <button type="button" className="mt-1 self-start text-xs font-medium text-stone-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-stone-300" disabled={needsConnection} onClick={() => onReveal(note)}>Show title</button>
        )}
        <p className="mt-1 flex-1 whitespace-pre-line text-sm text-muted line-clamp-3">{previewText(note.content, note.title)}</p>
        <div className="mt-3 flex items-center gap-1">
          <span className="text-xs text-faint">Deleted {timeAgo(note.deletedAt)}</span>
          {/* Restoring and deleting for good happen on the server: offline (or while noted. can't be
              reached) they're disabled rather than failing after a click. */}
          <span className="ml-auto flex gap-1" title={needsConnection ? 'Needs a connection' : undefined}>
            <button className="btn-secondary btn-sm" disabled={needsConnection} aria-describedby={needsConnection ? 'needs-connection' : undefined} onClick={() => onRestore(note)}>Restore</button>
            <button className="btn-danger btn-sm" disabled={needsConnection} aria-describedby={needsConnection ? 'needs-connection' : undefined} onClick={() => onDeleteForever(note)}>Delete forever</button>
          </span>
        </div>
      </div>
    );
  }
  const optimistic = String(note._id).startsWith('optimistic-');
  const title = displayTitle(note);
  // The card is a real link (stretched over the card via ::after), so it works with touch, keyboard, and
  // middle-click. The pin button is a sibling stacked above the link, not nested inside it.
  return (
    <article data-flip-id={note._id} className={`${motion} group relative flex flex-col rounded-xl border ${cardClass(note.color)} ${compact ? 'p-3' : 'p-4'} ${active || selectedIndex >= 0 ? `ring-2 ring-accent ${note.color ? '' : 'card-lift'}` : ''} shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift dark:shadow-none motion-reduce:hover:translate-y-0 active:translate-y-0 active:scale-[0.99] focus-within:ring-2 focus-within:ring-accent`}>
      <h3 className="pr-7 font-semibold text-stone-900 dark:text-stone-100 line-clamp-1 break-words">
        {optimistic ? (
          <span>{title}</span>
        ) : (
          <Link to={`/notes/${note._id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            onMouseEnter={() => api.prefetchNote(note._id)} onTouchStart={() => api.prefetchNote(note._id)} onFocus={() => api.prefetchNote(note._id)}>
            {note.locked ? <Icon name="lock" className="-mt-0.5 mr-1.5 inline" /> : note.emoji && <span className="mr-1.5" aria-hidden="true">{note.emoji}</span>}{title}
          </Link>
        )}
      </h3>
      {selecting && (
        <button type="button" onClick={() => onSelect(note)} aria-pressed={selectedIndex >= 0}
          aria-label={`${selectedIndex >= 0 ? 'Deselect' : 'Select'} ${note.title || 'Untitled'}`}
          className="absolute inset-0 z-20 flex items-start justify-end rounded-xl p-2 outline-none">
          <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold transition ${selectedIndex >= 0 ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white/80 dark:border-stone-600 dark:bg-stone-900/80'}`}>{selectedIndex >= 0 ? selectedIndex + 1 : ''}</span>
        </button>
      )}
      {onTogglePin && !selecting && (
        <button type="button"
          onClick={() => { if (!note.pending) onTogglePin(note); }}
          data-tip={note.pinned ? 'Unpin' : 'Pin to top'} data-tip-align="end" aria-label={note.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={note.pinned}
          className={`absolute right-1 top-1 z-10 grid h-11 w-11 place-items-center rounded-lg transition focus:opacity-100 sm:h-9 sm:w-9 ${note.pinned ? 'text-accent' : 'text-stone-400 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100'}`}>
          <PinIcon filled={note.pinned} />
        </button>
      )}
      <p className={`mt-1 flex-1 whitespace-pre-line break-words text-sm text-stone-600 dark:text-stone-300 ${compact ? "line-clamp-2" : "line-clamp-4"}`}>{note.locked ? <span className="inline-flex items-center gap-1.5 italic text-muted"><Icon name="lock" size="xs" />{unlockedPeek(note._id) ? 'Unlocked for now. Open it to read.' : 'Locked. Open it and enter your PIN.'}</span> : previewText(note.content, note.title)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">#{t}</span>
        ))}
        {note.dueAt && <DueBadge dueAt={note.dueAt} />}
        <span className="ml-auto text-xs text-faint">{note.pending ? (String(note._id).startsWith('optimistic-') ? 'Saving…' : 'Waiting to sync') : timeAgo(note.updatedAt)}</span>
      </div>
    </article>
  );
}
