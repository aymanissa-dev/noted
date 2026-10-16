import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MOD } from './keys.js';

export { MOD };

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// "G then …" jumps.
export const GO = { n: '/notes', a: '/archive', t: '/trash', s: '/settings', h: '/help' };

export function focusSearch(navigate, pathname) {
  const focus = () => document.getElementById('search')?.focus();
  if (document.getElementById('search')) focus();
  else { if (pathname !== '/notes') navigate('/notes'); setTimeout(focus, 80); }
}

// Global keyboard shortcuts (see shortcutList.js for the full, documented list).
// Single-key shortcuts are ignored while typing; Esc and Mod+K always work.
export function useShortcuts({ helpOpen, setHelpOpen, paletteOpen, setPaletteOpen }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pendingG = useRef(0);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHelpOpen(false);
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (paletteOpen) return; // the palette handles its own keys
      const typing = isTyping(document.activeElement);

      if (e.key === 'Escape') {
        if (helpOpen) return setHelpOpen(false);
        if (document.querySelector('[data-modal]')) return; // let modals handle their own Esc
        if (typing && !pathname.startsWith('/notes/')) return document.activeElement.blur();
        if (pathname !== '/notes') {
          e.preventDefault();
          if (window.history.state?.idx > 0) navigate(-1);
          else navigate('/notes');
        }
        return;
      }
      if (typing || document.querySelector('[data-modal]')) return;
      const k = e.key.toLowerCase();

      if (pendingG.current && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        if (GO[k]) { e.preventDefault(); navigate(GO[k]); }
        return;
      }
      if (k === 'g') { pendingG.current = Date.now(); return; }
      if (k === 'n') {
        e.preventDefault();
        navigate('/notes/new');
      } else if (e.key === '/') {
        e.preventDefault();
        focusSearch(navigate, pathname);
      } else if (k === 'q') {
        const el = document.getElementById('quick-capture');
        if (el) { e.preventDefault(); el.focus(); }
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, pathname, helpOpen, setHelpOpen, paletteOpen, setPaletteOpen]);
}
