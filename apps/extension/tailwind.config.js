/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Follac brand palette
        follac: {
          50: "#f0f4ff",
          100: "#dce6ff",
          200: "#b9cdff",
          300: "#8aaaff",
          400: "#5c82ff",
          500: "#3558fc",
          600: "#2240f0",
          700: "#1a30dd",
          800: "#1b2eb3",
          900: "#1c2d8e",
          950: "#141c5a",
        },
      },
      borderRadius: {
        "follac": "14px",
      },
      boxShadow: {
        "follac": "0 8px 40px rgba(53, 88, 252, 0.18), 0 2px 12px rgba(0,0,0,0.12)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      animation: {
        "slide-in": "slideIn 0.2s ease-out",
        "fade-in": "fadeIn 0.15s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
