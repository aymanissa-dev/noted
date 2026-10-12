import { useEffect, useState } from 'react';

const KEY = 'noted.theme';
const ORDER = ['system', 'light', 'dark'];
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(theme) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || 'system');

  useEffect(() => {
    localStorage.setItem(KEY, theme);
    apply(theme);
    if (theme !== 'system') return;
    const mq = media();
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const cycle = () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]);
  return { theme, setTheme, cycle };
}
