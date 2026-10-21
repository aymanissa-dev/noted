import { IS_MAC, keyParts } from '../lib/keys.js';

// Renders one shortcut ("Mod+K", "G N") as key caps, using the right labels for this platform.
export default function Kbd({ combo, size = '', className = '' }) {
  const steps = combo.split(' ');
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <span className="sr-only">{steps.map((s) => keyParts(s).join(' ')).join(' then ')}</span>
      {steps.map((step, i) => (
        <span key={i} className="inline-flex items-center gap-0.5" aria-hidden="true">
          {i > 0 && <span className="px-0.5 text-[11px] text-faint">then</span>}
          {keyParts(step).map((k, j) => <kbd key={j} className={`kbd ${size === 'sm' ? 'kbd-sm' : ''}`}>{k}</kbd>)}
        </span>
      ))}
    </span>
  );
}

export const KbdList = ({ combos, size }) => (
  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
    {combos.map((c, i) => <span key={c} className="inline-flex items-center gap-1.5">{i > 0 && <span className="text-[11px] text-faint">/</span>}<Kbd combo={c} size={size} /></span>)}
  </span>
);
export { IS_MAC };
