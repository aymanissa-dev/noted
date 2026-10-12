import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal dialog behaviour: focuses the dialog, keeps Tab inside it, closes on Esc,
// and returns focus to whatever was focused before it opened.
export function useFocusTrap(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // latest callback without re-running the effect
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement;
    const items = () => [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!node.contains(document.activeElement)) (node.querySelector('[autofocus]') || items()[0] || node).focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.preventDefault(); e.stopPropagation(); closeRef.current();
      } else if (e.key === 'Tab') {
        const list = items();
        if (!list.length) { e.preventDefault(); node.focus(); return; }
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true); // capture: runs before global shortcuts
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus?.();
    };
  }, [ref]);
}
