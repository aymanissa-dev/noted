import { useTheme } from '../lib/theme.js';
import Icon from './Icon.jsx';

const ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
const NEXT = { system: 'light', light: 'dark', dark: 'system' };

export default function ThemeToggle() {
  const { theme, cycle } = useTheme();
  return (
    <button type="button" className="btn-ghost btn-icon" onClick={cycle} data-tip={`Theme: ${theme} · click for ${NEXT[theme]}`} data-tip-align="end" aria-label={`Theme: ${theme}`}>
      <Icon name={ICON[theme] || 'monitor'} />
    </button>
  );
}
