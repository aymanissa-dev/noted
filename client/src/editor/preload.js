// Loads the editor chunk in the background when the browser is idle (once).
let started = false;
export const loadEditor = () => import('./MarkdownEditor.jsx');
export function preloadEditor() {
  if (started || typeof window === 'undefined') return undefined;
  const run = () => { started = true; loadEditor().catch(() => { started = false; }); };
  if ('requestIdleCallback' in window) { const id = requestIdleCallback(run, { timeout: 2500 }); return () => cancelIdleCallback(id); }
  const t = setTimeout(run, 1200); return () => clearTimeout(t);
}
