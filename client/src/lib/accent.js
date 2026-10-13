// Accent colors (RGB triplets for the --accent CSS variable). Keys match the server's ACCENTS.
export const ACCENTS = {
  amber: { label: 'Orange', rgb: '245 158 11' },
  rose: { label: 'Rose', rgb: '244 63 94' },
  emerald: { label: 'Green', rgb: '16 185 129' },
  sky: { label: 'Blue', rgb: '14 165 233' },
  violet: { label: 'Violet', rgb: '139 92 246' },
  stone: { label: 'Graphite', rgb: '120 113 108' },
};
const KEY = 'noted.accent';

export function applyAccent(key, { persist = true } = {}) {
  const accent = ACCENTS[key] ? key : 'amber';
  document.documentElement.style.setProperty('--accent', ACCENTS[accent].rgb);
  if (persist) try { localStorage.setItem(KEY, accent); } catch { /* ignore */ }
  return accent;
}
export const storedAccent = () => { try { return localStorage.getItem(KEY) || 'amber'; } catch { return 'amber'; } };
