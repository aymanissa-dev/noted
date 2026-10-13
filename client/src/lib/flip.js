import { useLayoutEffect, useRef } from 'react';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// FLIP: children with [data-flip-id] glide from their previous position to the new one (200ms)
// whenever `deps` change, e.g. a pinned card moving to the top or the gap closing after a removal.
export function useFlip(ref, deps) {
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = [...root.querySelectorAll('[data-flip-id]')];
    const next = new Map(els.map((el) => [el.dataset.flipId, el.getBoundingClientRect()]));
    if (!reduced()) {
      for (const el of els) {
        const before = prev.current.get(el.dataset.flipId);
        const after = next.get(el.dataset.flipId);
        if (!before) continue;
        const dx = before.left - after.left; const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    prev.current = next;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
