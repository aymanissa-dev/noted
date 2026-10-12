import { Link } from 'react-router-dom';
import { timeAgo } from '../lib/format.js';
import PinIcon from './PinIcon.jsx';

export default function NoteCard({ note, onTogglePin }) {
  return (
    <Link to={`/notes/${note._id}`}
      className="group relative flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        onClick={(e) => { e.preventDefault(); onTogglePin(note); }}
        title={note.pinned ? 'Unpin' : 'Pin'}
        className={`absolute right-3 top-3 rounded p-1 transition ${note.pinned ? 'text-amber-500' : 'text-stone-300 opacity-0 hover:text-stone-600 group-hover:opacity-100'}`}>
        <PinIcon filled={note.pinned} />
      </button>
      <h3 className="pr-6 font-semibold text-stone-900 line-clamp-1">{note.title || 'Untitled'}</h3>
      <p className="mt-1 flex-1 whitespace-pre-line text-sm text-stone-600 line-clamp-4">{note.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">#{t}</span>
        ))}
        <span className="ml-auto text-xs text-stone-400">{timeAgo(note.updatedAt)}</span>
      </div>
    </Link>
  );
}
