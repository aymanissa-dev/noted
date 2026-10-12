export default function PinIcon({ filled, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6z" />
    </svg>
  );
}
