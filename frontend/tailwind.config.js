/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d1a',
        card: '#161625',
        border: '#252540',
        accent: '#10b981',
        'accent-dim': '#059669',
        purple: '#6366f1',
        muted: '#94a3b8',
      },
    },
  },
  plugins: [],
}
