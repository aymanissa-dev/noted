import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const SHORTCUTS = [
  ['N', 'New note'],
  ['/', 'Search notes'],
  ['Q', 'Quick capture'],
  ['Esc', 'Go back / close'],
  ['⌘/Ctrl + S', 'Save now'],
  ['?', 'Show shortcuts'],
];

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// Global keyboard shortcuts. Single-key shortcuts are ignored while typing; Esc always works.
export function useShortcuts({ helpOpen, setHelpOpen }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = isTyping(document.activeElement);

      if (e.key === 'Escape') {
        if (helpOpen) return setHelpOpen(false);
        if (document.querySelector('[data-modal]')) return; // let modals handle their own Esc
        if (typing && !pathname.startsWith('/notes/')) return document.activeElement.blur();
        if (pathname !== '/') {
          e.preventDefault();
          if (window.history.state?.idx > 0) navigate(-1);
          else navigate('/');
        }
        return;
      }
      if (typing) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('/notes/new');
      } else if (e.key === '/') {
        e.preventDefault();
        const focusSearch = () => document.getElementById('search')?.focus();
        if (document.getElementById('search')) focusSearch();
        else { navigate('/'); setTimeout(focusSearch, 50); }
      } else if (e.key === 'q' || e.key === 'Q') {
        const el = document.getElementById('quick-capture');
        if (el) { e.preventDefault(); el.focus(); }
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, pathname, helpOpen, setHelpOpen]);
}
