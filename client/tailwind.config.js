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
    },
  },
  plugins: [],
};
