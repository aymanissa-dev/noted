import { useId, useRef } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import Icon from './Icon.jsx';

// Shared modal: overlay click / Esc closes, focus is trapped and restored, one look everywhere.
export default function Dialog({ title, description, children, footer, onClose, size = 'sm', role = 'dialog', closeButton = false, className = '', labelledBy }) {
  const ref = useRef(null);
  const id = useId();
  useFocusTrap(ref, onClose);
  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-4xl' }[size] || size;
  return (
    <div data-modal className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} role={role} aria-modal="true" aria-labelledby={labelledBy || (title ? `${id}-t` : undefined)} aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1} className={`dialog-panel ${width} ${className}`}>
        {(title || closeButton) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="min-w-0">
              {title && <h2 id={`${id}-t`} className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h2>}
              {description && <p id={`${id}-d`} className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            {closeButton && <button type="button" className="btn-ghost btn-icon -mr-2 -mt-1" onClick={onClose} aria-label="Close"><Icon name="close" /></button>}
          </div>
        )}
        {children && <div className="px-6 pt-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-5 pt-5">{footer}</div>}
        {!footer && <div className="pb-5" />}
      </div>
    </div>
  );
}
