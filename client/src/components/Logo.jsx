import { LOGO, MARK } from '../brand.js';

// The Noted logo (src/brand.js, generated from client/brand/ by scripts/brand.mjs). Drawn in
// currentColor, so it's near-black on light surfaces and near-white in dark mode. Sized by the
// font size in `className` (the wordmark is ~1.15em tall), so existing text-* sizes keep working.
// `mark`: only the "N" mark (tight spaces).
export default function Logo({ className = 'text-2xl', mark = false, title = 'Noted' }) {
  const g = mark ? MARK : LOGO;
  return (
    <span className={`inline-flex items-center align-middle text-stone-900 dark:text-stone-50 ${className}`}>
      <svg viewBox={g.viewBox} role="img" aria-label={title} className="block h-[1.15em] w-auto" focusable="false">
        <path fill="currentColor" fillRule="evenodd" d={g.d} />
      </svg>
    </span>
  );
}
