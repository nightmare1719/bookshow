/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#e50914',
          'red-hover': '#b91c1c',
          dark: '#1a1a2e',
          'dark-border': '#2d2d4e',
          'dark-bg': '#0f0f0f',
        }
      }
    },
  },
  plugins: [],
}
