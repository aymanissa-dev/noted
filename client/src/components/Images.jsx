import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { imageApi } from '../lib/api.js';
import { getImageUrl } from '../lib/imageStore.js';
import { splitImages } from '../lib/markdown.js';
import Icon from './Icon.jsx';

// Loads a note image (with auth) into a blob: URL. Locked notes pass their unlock token.
export const loadNoteImage = (id, { noteId, locked, unlockToken }) => getImageUrl(id, { noteId, locked, fetcher: (i) => imageApi.fetch(i, unlockToken) });

// Click-to-view: the image at full size over a dark backdrop. Esc, the close button or a click outside closes it.
export function ImageLightbox({ src, alt, onClose }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  return (
    <div data-modal className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={alt ? `Image: ${alt}` : 'Image'} tabIndex={-1} className="flex max-h-full max-w-full flex-col items-center outline-none" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <button type="button" autoFocus onClick={onClose} aria-label="Close image" className="fixed right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Icon name="close" /></button>
        <img src={src} alt={alt || ''} data-testid="lightbox-image" className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" />
        {alt && <p className="mt-3 max-w-prose text-center text-sm text-white/80">{alt}</p>}
      </div>
    </div>
  );
}

// One image in read-only text (history preview): lazy, with a quiet fallback if it's gone.
export function NoteImage({ id, alt, noteId, locked, unlockToken, onOpen }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    let alive = true; const node = ref.current;
    const load = () => loadNoteImage(id, { noteId, locked, unlockToken }).then((u) => alive && setUrl(u)).catch((e) => alive && setError(e));
    if (!('IntersectionObserver' in window) || !node) { load(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px 0px' });
    io.observe(node);
    return () => { alive = false; io.disconnect(); };
  }, [id, noteId, locked, unlockToken]);
  if (error) return <span ref={ref} className="my-2 block rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-muted dark:border-stone-700">{error.status === 404 ? 'Image deleted' : 'Image unavailable'}{alt ? `: ${alt}` : ''}</span>;
  return (
    <span ref={ref} className="my-2 block">
      {url
        ? <button type="button" className="block max-w-full" onClick={() => onOpen?.({ src: url, alt })} aria-label={alt ? `View image: ${alt}` : 'View image'}><img src={url} alt={alt} loading="lazy" decoding="async" className="max-h-80 max-w-full rounded-lg" /></button>
        : <span className="block h-40 w-full max-w-sm animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" aria-label="Loading image" />}
    </span>
  );
}

// Plain note text with its images shown inline (version history).
export function TextWithImages({ text, className, ...imageProps }) {
  const [box, setBox] = useState(null);
  return (
    <div className={className}>
      {splitImages(text).map((p, i) => (p.image
        ? <NoteImage key={`${p.image}-${i}`} id={p.image} alt={p.alt} {...imageProps} onOpen={setBox} />
        : <span key={i}>{p.text}</span>))}
      {box && <ImageLightbox {...box} onClose={() => setBox(null)} />}
    </div>
  );
}
