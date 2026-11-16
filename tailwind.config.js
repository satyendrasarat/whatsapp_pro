33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wa: {
          light: '#25D366',
          DEFAULT: '#128C7E',
          dark: '#075E54',
          teal: '#00a884',
          chat: '#111b21',
          bg: '#0c1317'
        }
      }
    },
  },
  plugins: [],
}

