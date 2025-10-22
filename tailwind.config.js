/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    fontFamily: {
      sans: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'],
    },
    extend: {
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 500ms ease-out both',
        'fade-in-up': 'fade-in-up 600ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'pop-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.2s linear infinite',
        float: 'float 4s ease-in-out infinite',
      },
      boxShadow: {
        glow: '0 0 0 2px rgb(16 185 129 / 0.15), 0 10px 20px -10px rgb(16 185 129 / 0.35)',
      },
      backgroundImage: {
        'gradient-shimmer': 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(16,185,129,0.2) 50%, rgba(255,255,255,0) 100%)',
      },
    },
  },
  plugins: [],
};
