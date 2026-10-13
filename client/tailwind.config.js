export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      // The accent (user-selectable) drives the logo dot, highlights, and focus rings.
      colors: { accent: 'rgb(var(--accent) / <alpha-value>)' },
      // One corner radius for every surface (cards, inputs, buttons, dialogs).
      borderRadius: { lg: 'var(--radius)', xl: 'var(--radius)', '2xl': 'var(--radius)' },
      // Animations stay in the 150–250ms range.
      transitionDuration: { DEFAULT: '200ms' },
      maxWidth: { reading: '70ch' },
      // Every animation is 150–250ms (and switched off under prefers-reduced-motion in index.css).
      keyframes: {
        'slide-in': { from: { opacity: '0', transform: 'translateY(-8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        leave: { from: { opacity: '1', transform: 'none' }, to: { opacity: '0', transform: 'scale(0.94)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
        pop: { '0%': { opacity: '0', transform: 'scale(0.5)' }, '70%': { opacity: '1', transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
        'soft-pulse': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        'dot-bounce': { '0%,100%': { transform: 'translateY(0)' }, '40%': { transform: 'translateY(-0.28em)' }, '70%': { transform: 'translateY(0.04em)' } },
        'unlock': { '0%': { transform: 'rotate(0)' }, '50%': { transform: 'rotate(-12deg) translateY(-2px)' }, '100%': { transform: 'rotate(0)' } },
      },
      animation: {
        'slide-in': 'slide-in 220ms cubic-bezier(.2,.8,.2,1) both',
        leave: 'leave 200ms ease-in forwards',
        shake: 'shake 250ms ease-in-out',
        pop: 'pop 220ms cubic-bezier(.2,.8,.2,1) both',
        'soft-pulse': 'soft-pulse 250ms ease-in-out infinite alternate',
        'dot-bounce': 'dot-bounce 250ms cubic-bezier(.3,.7,.4,1) 300ms 1 both',
        unlock: 'unlock 200ms ease-out both',
      },
    },
  },
  plugins: [],
};
