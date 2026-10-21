// Note color palette. Keys match the server's NOTE_COLORS. Class strings are literal so Tailwind keeps them.
// Dark mode uses a faint tint plus a colored hairline, so user colors never out-shout the accent/primary action.
export const COLORS = {
  '': { label: 'Default', swatch: 'bg-white dark:bg-stone-900', card: '' },
  red: { label: 'Red', swatch: 'bg-red-300', card: 'bg-red-50 border-red-200 dark:bg-red-400/[0.07] dark:border-red-400/40' },
  orange: { label: 'Orange', swatch: 'bg-orange-300', card: 'bg-orange-50 border-orange-200 dark:bg-orange-400/[0.07] dark:border-orange-400/40' },
  yellow: { label: 'Yellow', swatch: 'bg-yellow-200', card: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-300/[0.06] dark:border-yellow-300/35' },
  green: { label: 'Green', swatch: 'bg-emerald-300', card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-400/[0.07] dark:border-emerald-400/35' },
  blue: { label: 'Blue', swatch: 'bg-sky-300', card: 'bg-sky-50 border-sky-200 dark:bg-sky-400/[0.07] dark:border-sky-400/40' },
  purple: { label: 'Purple', swatch: 'bg-violet-300', card: 'bg-violet-50 border-violet-200 dark:bg-violet-400/[0.08] dark:border-violet-400/40' },
  gray: { label: 'Gray', swatch: 'bg-stone-300', card: 'bg-stone-100 border-stone-300 dark:bg-white/[0.05] dark:border-stone-400/35' },
};

export const EMOJIS = ['📝', '💡', '⭐', '📌', '✅', '📚', '🛒', '💼', '🏠', '❤️', '🎯', '🔒', '✈️', '🍳', '💰', '🎵'];

export const cardClass = (color) => COLORS[color]?.card || 'bg-white dark:bg-stone-900 border-stone-200/80 dark:border-stone-800';
