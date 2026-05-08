/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0891b2',
        'primary-light': '#22d3ee',
        surface: '#09090b',
        card: '#18181b',
        border: '#27272a',
        muted: '#71717a',
      },
      fontFamily: {
        heading: ['Lora', 'Georgia', 'serif'],
        body: ['Raleway', 'sans-serif'],
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
}
