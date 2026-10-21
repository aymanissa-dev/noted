import { useEffect, useState } from 'react';

// Typewriter mode: keep the line you're typing on in the middle of the screen. It's a device
// preference (like the theme), works on its own or together with Focus mode, and any open editor
// follows changes made from the palette, the toolbar or the shortcut (Alt+Shift+T).
const KEY = 'noted:typewriter';
const EVENT = 'noted:typewriter';

export const getTypewriter = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setTypewriter = (on) => {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode: still applies this session */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
  return on;
};
export const toggleTypewriter = () => setTypewriter(!getTypewriter());

// Alt+Shift+T (event.code, so it works on Mac where Option changes the character).
export const isTypewriterShortcut = (e) => e.code === 'KeyT' && e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey;

export function useTypewriter() {
  const [on, setOn] = useState(getTypewriter);
  useEffect(() => {
    const sync = (e) => setOn(e?.detail ?? getTypewriter());
    const fromStorage = (e) => { if (e.key === KEY) setOn(getTypewriter()); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', fromStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', fromStorage); };
  }, []);
  return on;
}
