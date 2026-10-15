/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        panel: token('panel'),
        sunk: token('sunk'),
        ink: token('ink'),
        steel: token('steel'),
        line: token('line'),
        ash: token('ash'),
        molten: token('molten'),
        patina: token('patina'),
        oxblood: token('oxblood'),
        cobalt: token('cobalt'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Modular scale (1.2) anchored at 14px for a dense operations UI
        xs: ['11.5px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16.8px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '30px'],
        '3xl': ['29px', '34px'],
        '4xl': ['35px', '40px'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}
