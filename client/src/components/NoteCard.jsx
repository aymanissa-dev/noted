import { Link } from 'react-router-dom';
import { timeAgo } from '../lib/format.js';
import PinIcon from './PinIcon.jsx';
import { cardClass } from '../lib/colors.js';

export default function NoteCard({ note, onTogglePin, onRestore, onDeleteForever }) {
  if (note.deletedAt) {
    return (
      <div className="flex flex-col rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 p-4">
        <h3 className="font-semibold text-stone-700 dark:text-stone-200 line-clamp-1">{note.title || 'Untitled'}</h3>
        <p className="mt-1 flex-1 whitespace-pre-line text-sm text-stone-500 dark:text-stone-400 line-clamp-3">{note.content}</p>
        <div className="mt-3 flex items-center gap-1">
          <span className="text-xs text-stone-400">Deleted {timeAgo(note.deletedAt)}</span>
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => onRestore(note)}>Restore</button>
          <button className="btn-danger px-2 py-1 text-xs" onClick={() => onDeleteForever(note)}>Delete forever</button>
        </div>
      </div>
    );
  }
  return (
    <Link to={`/notes/${note._id}`}
      className={`group relative flex flex-col rounded-xl border ${cardClass(note.color)} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
      {onTogglePin && <button
        onClick={(e) => { e.preventDefault(); onTogglePin(note); }}
        title={note.pinned ? 'Unpin' : 'Pin'}
        className={`absolute right-3 top-3 rounded p-1 transition ${note.pinned ? 'text-amber-500' : 'text-stone-300 opacity-0 hover:text-stone-600 group-hover:opacity-100'}`}>
        <PinIcon filled={note.pinned} />
      </button>}
      <h3 className="pr-6 font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">{note.emoji && <span className="mr-1.5">{note.emoji}</span>}{note.title || 'Untitled'}</h3>
      <p className="mt-1 flex-1 whitespace-pre-line text-sm text-stone-600 dark:text-stone-300 line-clamp-4">{note.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-600 dark:text-stone-300">#{t}</span>
        ))}
        <span className="ml-auto text-xs text-stone-400">{timeAgo(note.updatedAt)}</span>
      </div>
    </Link>
  );
}
