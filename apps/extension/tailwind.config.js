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
        "slide-in":    "slideIn 0.22s cubic-bezier(0.16,1,0.3,1)",
        "fade-in":     "fadeIn 0.18s ease-out",
        "fade-up":     "fadeUp 0.22s cubic-bezier(0.16,1,0.3,1)",
        "fade-up-1":   "fadeUp 0.22s cubic-bezier(0.16,1,0.3,1) 0.04s both",
        "fade-up-2":   "fadeUp 0.22s cubic-bezier(0.16,1,0.3,1) 0.08s both",
        "fade-up-3":   "fadeUp 0.22s cubic-bezier(0.16,1,0.3,1) 0.12s both",
        "pulse-soft":  "pulseSoft 1.4s ease-in-out infinite",
        "fade-out":    "fadeOut 0.15s ease-in forwards",
      },
      keyframes: {
        slideIn: {
          "0%":   { transform: "translateX(24px)", opacity: "0" },
          "100%": { transform: "translateX(0)",    opacity: "1" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "0.9" },
        },
        fadeOut: {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
