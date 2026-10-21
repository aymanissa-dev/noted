import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Dropdown menu: click or Enter opens; arrows move; Esc / outside click / navigation closes.
// `children` is a function receiving `close`, rendering .menu-item buttons/links (role="menuitem").
export default function Menu({ button, label, tip, align = 'right', className = '', buttonClass = 'btn-ghost btn-icon', children, testId, tour }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btn = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const items = () => [...(ref.current?.querySelectorAll('[role=menuitem]:not([disabled])') || [])].filter((el) => el.getClientRects().length); // visible ones only
    requestAnimationFrame(() => items()[0]?.focus());
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); return; }
      if (e.key === 'Tab') { setOpen(false); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items(); const i = list.indexOf(document.activeElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button ref={btn} type="button" className={buttonClass} aria-label={label} data-tip={open ? undefined : tip} data-tip-align={align === 'right' ? 'end' : 'start'}
        aria-haspopup="menu" aria-expanded={open} data-testid={testId} data-tour={tour} onClick={() => setOpen((o) => !o)}>{button}</button>
      {open && (
        <div role="menu" aria-label={label} className={`menu absolute mt-2 ${align === 'right' ? 'right-0' : 'left-0'}`} onClick={(e) => { if (e.target.closest('[role=menuitem]')) close(); }}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
