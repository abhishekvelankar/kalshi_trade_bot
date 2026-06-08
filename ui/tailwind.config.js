/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        netflix: {
          bg: '#141414',
          surface: '#1f1f1f',
          card: '#2a2a2a',
          border: '#3a3a3a',
          red: '#e50914',
          'red-hover': '#f40612',
          'red-dim': '#b20710',
          green: '#46d369',
          yellow: '#f5c518',
          text: '#ffffff',
          muted: '#b3b3b3',
          dim: '#6d6d6d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
