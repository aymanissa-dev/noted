// Note color palette. Keys match the server's NOTE_COLORS. Class strings are literal so Tailwind keeps them.
export const COLORS = {
  '': { label: 'Default', swatch: 'bg-white dark:bg-stone-900', card: '' },
  red: { label: 'Red', swatch: 'bg-red-300', card: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900' },
  orange: { label: 'Orange', swatch: 'bg-orange-300', card: 'bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900' },
  yellow: { label: 'Yellow', swatch: 'bg-yellow-200', card: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-900' },
  green: { label: 'Green', swatch: 'bg-emerald-300', card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900' },
  blue: { label: 'Blue', swatch: 'bg-sky-300', card: 'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900' },
  purple: { label: 'Purple', swatch: 'bg-violet-300', card: 'bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-900' },
  gray: { label: 'Gray', swatch: 'bg-stone-300', card: 'bg-stone-100 border-stone-300 dark:bg-stone-800 dark:border-stone-700' },
};

export const EMOJIS = ['📝', '💡', '⭐', '📌', '✅', '📚', '🛒', '💼', '🏠', '❤️', '🎯', '🔒', '✈️', '🍳', '💰', '🎵'];

export const cardClass = (color) => COLORS[color]?.card || 'bg-white dark:bg-stone-900 border-stone-200/80 dark:border-stone-800';
