/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#0df259",
        "primary-blue": "#197fe6",
        "background-light": "#f5f8f6",
        "background-dark": "#102216",
        "surface-dark": "#1a2e21",
        "border-dark": "#28392e",
      },
      fontFamily: {
        "display": ["Space Grotesk", "Inter", "sans-serif"]
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
