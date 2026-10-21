import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Dashboard from './Dashboard.jsx';
import NoteEditor from './NoteEditor.jsx';

const WIDE = '(min-width: 1280px)';
const useWide = () => {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
};

// /notes/new and /notes/:id. On wide screens the list stays open beside the note (split view);
// on narrow screens the editor is a standalone page. The editor remounts per note (flushing the
// previous one), except when a new note just got its id, so typing isn't interrupted.
export default function NoteRoute() {
  const { id } = useParams();
  const { state } = useLocation();
  const keyRef = useRef(id || 'new');
  if (!state?.created) keyRef.current = id || 'new';
  const wide = useWide();
  const editor = <NoteEditor key={keyRef.current} />;
  if (!wide) return editor;
  return (
    <div className="grid grid-cols-[20rem_minmax(0,1fr)] gap-6 2xl:grid-cols-[23rem_minmax(0,1fr)] 2xl:gap-8 min-[2200px]:grid-cols-[26rem_minmax(0,1fr)]">
      <aside aria-label="Notes list" className="sticky top-[calc(var(--header-h)+1.5rem)] max-h-[calc(100vh-var(--header-h)-3rem)] overflow-y-auto rounded-2xl border border-stone-200/70 bg-stone-100/60 p-3 dark:border-white/[0.06] dark:bg-[rgb(var(--s1))]">
        <Dashboard view="active" compact activeId={id} />
      </aside>
      <div className="min-w-0">{editor}</div>
    </div>
  );
}
